import { BigNumberish, concat, Contract, Provider } from 'ethers';

import { IEntryPointABI } from './internal/entryPointAbi';
import { FactoryParams, packUserOp, toHexBytes, UserOperation } from './internal/userOp';
import { PaymasterAPI } from './PaymasterAPI';
import { TransactionDetailsForUserOp } from './TransactionDetailsForUserOp';

export interface BaseApiParams {
    provider: Provider;
    entryPointAddress: string;
    accountAddress?: string;
    paymasterAPI?: PaymasterAPI;
}

export interface UserOpResult {
    transactionHash: string;
    success: boolean;
}

/**
 * Base class for ERC-4337 v0.8 account clients. A subclass implements the account-specific
 * bits (initCode, nonce, execute encoding, signing); this class assembles + signs UserOps.
 */
export abstract class BaseAccountAPI {
    private senderAddress?: string;
    private isPhantom = true;
    // EntryPoint connected read-only (provider) — used for static calls + userOpHash.
    protected readonly entryPointView: Contract;

    provider: Provider;
    entryPointAddress: string;
    accountAddress?: string;
    paymasterAPI?: PaymasterAPI;

    protected constructor(params: BaseApiParams) {
        this.provider = params.provider;
        this.entryPointAddress = params.entryPointAddress;
        this.accountAddress = params.accountAddress;
        this.paymasterAPI = params.paymasterAPI;
        this.entryPointView = new Contract(params.entryPointAddress, IEntryPointABI, params.provider);
    }

    async init(): Promise<this> {
        if ((await this.provider.getCode(this.entryPointAddress)) === '0x') {
            throw new Error(`entryPoint not deployed at ${this.entryPointAddress}`);
        }
        await this.getAccountAddress();
        return this;
    }

    /** initCode `factory` + `factoryData` when the account is not yet deployed. */
    abstract getFactoryData(): Promise<FactoryParams | null>;

    /** Current account nonce. */
    abstract getNonce(): Promise<bigint>;

    /** Encode the call from EntryPoint through the account to the target contract. */
    abstract encodeExecute(target: string, value: BigNumberish, data: string): Promise<string>;

    /** Sign a userOpHash. */
    abstract signUserOpHash(userOpHash: string): Promise<string>;

    /** Whether the account contract is not yet deployed. */
    async checkAccountPhantom(): Promise<boolean> {
        if (!this.isPhantom) {
            return this.isPhantom;
        }
        const senderAddressCode = await this.provider.getCode(await this.getAccountAddress());
        if (senderAddressCode.length > 2) {
            this.isPhantom = false;
        }
        return this.isPhantom;
    }

    /** Compute the account address before deployment (via EntryPoint.getSenderAddress). */
    async getCounterFactualAddress(): Promise<string> {
        const { factory, factoryData } = (await this.getFactoryData()) ?? {};
        if (factory == null) {
            throw new Error('no counterfactual address without a factory');
        }
        const initCode = concat([factory, toHexBytes(factoryData)]);
        try {
            await this.entryPointView.getSenderAddress.staticCall(initCode);
        } catch (e) {
            // getSenderAddress always reverts with SenderAddressResult(sender)
            const err = e as { revert?: { name?: string; args?: unknown[] }; data?: string };
            if (err.revert?.name === 'SenderAddressResult') {
                return err.revert.args?.[0] as string;
            }
            if (err.data != null) {
                return this.entryPointView.interface.decodeErrorResult('SenderAddressResult', err.data)[0] as string;
            }
            throw e;
        }
        throw new Error('getSenderAddress did not revert as expected');
    }

    /** initCode for the UserOp (factory + factoryData), or null if already deployed. */
    async getRequiredFactoryData(): Promise<FactoryParams | null> {
        if (await this.checkAccountPhantom()) {
            return await this.getFactoryData();
        }
        return null;
    }

    /** Maximum gas used for verification (creation cost is added on top when phantom). */
    async getVerificationGasLimit(): Promise<BigNumberish> {
        return 100000;
    }

    /** Return userOpHash for signing — computed on-chain to match EntryPoint exactly. */
    async getUserOpHash(op: UserOperation): Promise<string> {
        return await this.entryPointView.getUserOpHash.staticCall(packUserOp(op));
    }

    /** Account address (valid even before deployment). */
    async getAccountAddress(): Promise<string> {
        if (this.senderAddress == null) {
            this.senderAddress = this.accountAddress ?? (await this.getCounterFactualAddress());
        }
        return this.senderAddress;
    }

    async encodeUserOpCallDataAndGasLimit(
        detailsForUserOp: TransactionDetailsForUserOp,
    ): Promise<{ callData: string; callGasLimit: bigint }> {
        const value = detailsForUserOp.value != null && detailsForUserOp.value !== '' ? BigInt(detailsForUserOp.value) : 0n;
        const callData = await this.encodeExecute(detailsForUserOp.target, value, detailsForUserOp.data);

        const callGasLimit =
            detailsForUserOp.gasLimit != null && detailsForUserOp.gasLimit !== ''
                ? BigInt(detailsForUserOp.gasLimit)
                : await this.provider.estimateGas({
                      from: this.entryPointAddress,
                      to: await this.getAccountAddress(),
                      data: callData,
                  });

        return { callData, callGasLimit };
    }

    async estimateCreationGas(factoryParams: FactoryParams | null): Promise<bigint> {
        if (factoryParams == null) {
            return 0n;
        }
        const senderCreator: string = await this.entryPointView.senderCreator();
        return await this.provider.estimateGas({
            from: senderCreator,
            to: factoryParams.factory,
            data: toHexBytes(factoryParams.factoryData),
        });
    }

    /**
     * Create an unsigned UserOperation with all fields filled (signature empty).
     */
    async createUnsignedUserOp(info: TransactionDetailsForUserOp): Promise<UserOperation> {
        const { callData, callGasLimit } = await this.encodeUserOpCallDataAndGasLimit(info);
        const factoryParams = await this.getRequiredFactoryData();

        const initGas = await this.estimateCreationGas(factoryParams);
        const verificationGasLimit = BigInt(await this.getVerificationGasLimit()) + initGas;

        let maxFeePerGas = info.maxFeePerGas;
        let maxPriorityFeePerGas = info.maxPriorityFeePerGas;
        if (maxFeePerGas == null || maxPriorityFeePerGas == null) {
            const feeData = await this.provider.getFeeData();
            maxFeePerGas ??= feeData.maxFeePerGas ?? undefined;
            maxPriorityFeePerGas ??= feeData.maxPriorityFeePerGas ?? undefined;
        }
        if (maxFeePerGas == null || maxPriorityFeePerGas == null) {
            throw new Error('could not resolve gas fees from provider; pass maxFeePerGas/maxPriorityFeePerGas explicitly');
        }

        let partialUserOp: UserOperation = {
            sender: await this.getAccountAddress(),
            nonce: info.nonce ?? (await this.getNonce()),
            factory: factoryParams?.factory,
            factoryData: factoryParams?.factoryData,
            callData,
            callGasLimit,
            verificationGasLimit,
            maxFeePerGas,
            maxPriorityFeePerGas,
            preVerificationGas: 60000,
            signature: '',
            authorizationList: [],
        };

        if (this.paymasterAPI != null) {
            const pmFields = await this.paymasterAPI.getTemporaryPaymasterData();
            if (pmFields != null) {
                partialUserOp = {
                    ...partialUserOp,
                    paymaster: pmFields.paymaster,
                    paymasterPostOpGasLimit: pmFields.paymasterPostOpGasLimit,
                    paymasterVerificationGasLimit: pmFields.paymasterVerificationGasLimit,
                    paymasterData: pmFields.paymasterData,
                };
            }
        }
        return partialUserOp;
    }

    /** Sign a filled userOp. */
    async signUserOp(userOp: UserOperation): Promise<UserOperation> {
        const userOpHash = await this.getUserOpHash(userOp);
        const signature = await this.signUserOpHash(userOpHash);
        return { ...userOp, signature };
    }

    /** Create and sign a UserOperation. */
    async createSignedUserOp(info: TransactionDetailsForUserOp): Promise<UserOperation> {
        return await this.signUserOp(await this.createUnsignedUserOp(info));
    }
}
