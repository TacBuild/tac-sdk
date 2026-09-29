import { AbstractProvider, BigNumberish, Contract, getDefaultProvider, MaxUint256, parseUnits } from 'ethers';

import { getArtifacts } from '../sdk/Artifacts';
import { Network } from '../structs/Struct';
import { Ed25519Signer } from './Ed25519';
import { HttpRpcClient } from './HttpRpcClient';
import { UserOperation } from './internal/userOp';
import { AA_NETWORKS, AaAddresses } from './networks';
import { PaymasterAPI } from './PaymasterAPI';
import { buildSignedUserOpWithPermit } from './PermitFlow';
import { aaSignerFromMnemonic } from './signer';
import { TacAccountAPI } from './TacAccountAPI';
import { TacERC20PaymasterAPI, TacPaymasterMode } from './TacERC20PaymasterAPI';

/** A single call to execute through the smart account. */
export interface SendTx {
    target: string;
    data: string;
    value?: BigNumberish;
    /** Defaults to 1_000_000 (the SDK under-estimates the deploying op). */
    gasLimit?: BigNumberish;
}

/** Extra options for the permit (Mode 1) flow — all optional. */
export interface PermitOptions {
    /** Token to pay gas in. Defaults to the paymaster's configured token. */
    feeToken?: string;
    /** Max token the paymaster may pull. Defaults to 1000 units of the fee token. */
    maxFee?: BigNumberish;
    /** Permit deadline (unix seconds). Defaults to no expiry. */
    deadline?: BigNumberish;
    paymasterVerificationGasLimit?: BigNumberish;
    paymasterPostOpGasLimit?: BigNumberish;
}

/** The bundler's UserOperation receipt (subset). */
export interface UserOpReceipt {
    userOpHash: string;
    success: boolean;
    receipt: { transactionHash: string; blockNumber?: string };
    actualGasCost?: string;
    actualGasUsed?: string;
}

export interface UserOpSendResult {
    userOpHash: string;
    receipt: UserOpReceipt;
}

export interface TacAccountSdkParams {
    network: Network;
    /** TON mnemonic — the AA account identity. */
    mnemonic: string;
    /** Bundler RPC URL. Required to send (no public default is shipped). */
    bundlerUrl?: string;
    /** Override the TAC EVM provider (default: getDefaultProvider(network's TAC RPC)). */
    provider?: AbstractProvider;
    /** Override any AA contract address. */
    addresses?: Partial<AaAddresses>;
}

/**
 * High-level, network-defaulted entry point for the TAC AA bundler — mirrors
 * `TacSdk.create({ network })`. Resolves provider + contract addresses from built-in
 * per-network defaults and derives the signer from a mnemonic; the paymaster/permit data
 * is built internally by the send methods.
 *
 * ```ts
 * const aa = await TacAccountSdk.create({ network: Network.TESTNET, mnemonic, bundlerUrl });
 * const { userOpHash, receipt } = await aa.sendUserOp({ target, value, data });
 * ```
 */
export class TacAccountSdk {
    readonly account: TacAccountAPI;

    private readonly _signer: Ed25519Signer;
    private readonly _publicKey: string;
    private _bundler?: HttpRpcClient;
    private _address?: string;
    private _tokenInfo?: { address: string; decimals: number };
    private _permitCounter = 0;

    private constructor(
        readonly network: Network,
        readonly provider: AbstractProvider,
        readonly addresses: AaAddresses,
        readonly chainId: number,
        readonly bundlerUrl: string | undefined,
        publicKey: string,
        signer: Ed25519Signer,
    ) {
        this._publicKey = publicKey;
        this._signer = signer;
        this.account = new TacAccountAPI({
            provider,
            entryPointAddress: addresses.entryPoint,
            factoryAddress: addresses.accountFactory,
            publicKey,
            signer,
        });
    }

    static async create(params: TacAccountSdkParams): Promise<TacAccountSdk> {
        const cfg = AA_NETWORKS[params.network];
        if (cfg == null) {
            throw new Error(`account abstraction is not available on network "${params.network}" yet`);
        }
        let provider = params.provider;
        if (provider == null) {
            const rpc = (getArtifacts(params.network) as { TAC_RPC_ENDPOINT?: string }).TAC_RPC_ENDPOINT;
            if (rpc == null) {
                throw new Error(`no default TAC RPC for network "${params.network}"; pass a custom provider`);
            }
            provider = getDefaultProvider(rpc);
        }
        const addresses: AaAddresses = {
            entryPoint: params.addresses?.entryPoint ?? cfg.entryPoint,
            accountFactory: params.addresses?.accountFactory ?? cfg.accountFactory,
            paymaster: params.addresses?.paymaster ?? cfg.paymaster,
            permit2: params.addresses?.permit2 ?? cfg.permit2,
        };
        const { publicKey, signer } = await aaSignerFromMnemonic(params.mnemonic);
        return new TacAccountSdk(
            params.network,
            provider,
            addresses,
            cfg.chainId,
            params.bundlerUrl ?? cfg.bundlerUrl,
            publicKey,
            signer,
        );
    }

    /** The deterministic smart-account address (derived from the TON public key). */
    async getAccountAddress(): Promise<string> {
        this._address ??= await this.account.getAccountAddress();
        return this._address;
    }

    /** Send a call paying gas natively (account must hold TAC). */
    async sendUserOp(tx: SendTx): Promise<UserOpSendResult> {
        const op = await this.account.createSignedUserOp(this._txDetails(tx));
        return await this._submit(op);
    }

    /** Send a call paying gas in an ERC-20 via the paymaster (Mode 1 — Permit2). */
    async sendUserOpWithPermit(tx: SendTx & PermitOptions): Promise<UserOpSendResult> {
        const token = await this._tokenInfoResolved();
        const op = await buildSignedUserOpWithPermit({
            accountAPI: this.account,
            paymaster: this.addresses.paymaster,
            paymasterVerificationGasLimit: tx.paymasterVerificationGasLimit ?? 500_000,
            paymasterPostOpGasLimit: tx.paymasterPostOpGasLimit ?? 150_000,
            permitInput: {
                permitted: [{ token: tx.feeToken ?? token.address, amount: tx.maxFee ?? parseUnits('1000', token.decimals) }],
                nonce: this._newPermitNonce(),
                deadline: tx.deadline ?? MaxUint256,
                chainId: this.chainId,
                verifyingContract: this.addresses.permit2,
            },
            ed25519Signer: this._signer,
            txDetails: this._txDetails(tx),
        });
        return await this._submit(op);
    }

    /** Send a call paying gas from the account's pre-credited internal balance (Mode 2). */
    async sendUserOpViaInternalBalance(tx: SendTx): Promise<UserOpSendResult> {
        return await this._sendViaMode(tx, TacPaymasterMode.INTERNAL_BALANCE);
    }

    /** Send a call where the paymaster pulls the fee token via a pre-set allowance (Mode 0). */
    async sendUserOpViaAllowance(tx: SendTx): Promise<UserOpSendResult> {
        return await this._sendViaMode(tx, TacPaymasterMode.TRANSFER_FROM_REQUESTOR);
    }

    /** Poll the bundler for a UserOperation receipt. */
    async waitForReceipt(userOpHash: string, opts?: { timeoutMs?: number; intervalMs?: number }): Promise<UserOpReceipt> {
        const client = this._bundlerClient();
        const end = Date.now() + (opts?.timeoutMs ?? 120_000);
        while (Date.now() < end) {
            const r = await client.getUserOperationReceipt(userOpHash);
            if (r != null) {
                return r as UserOpReceipt;
            }
            await new Promise((res) => setTimeout(res, opts?.intervalMs ?? 3_000));
        }
        throw new Error(`userOp ${userOpHash} not mined within timeout`);
    }

    /** The bundler client (throws if no bundler URL was configured). */
    bundler(): HttpRpcClient {
        return this._bundlerClient();
    }

    // ── internals ──────────────────────────────────────────────────────────────

    private _bundlerClient(): HttpRpcClient {
        if (this.bundlerUrl == null || this.bundlerUrl === '') {
            throw new Error('no bundler URL configured — pass `bundlerUrl` to TacAccountSdk.create({ ... })');
        }
        this._bundler ??= new HttpRpcClient(this.bundlerUrl, this.addresses.entryPoint, this.chainId);
        return this._bundler;
    }

    private _txDetails(tx: SendTx) {
        return { target: tx.target, value: tx.value ?? 0, data: tx.data, gasLimit: tx.gasLimit ?? 1_000_000 };
    }

    private async _sendViaMode(tx: SendTx, mode: TacPaymasterMode): Promise<UserOpSendResult> {
        const paymasterAPI: PaymasterAPI = new TacERC20PaymasterAPI({ paymaster: this.addresses.paymaster, mode });
        const account = new TacAccountAPI({
            provider: this.provider,
            entryPointAddress: this.addresses.entryPoint,
            factoryAddress: this.addresses.accountFactory,
            publicKey: this._publicKey,
            signer: this._signer,
            accountAddress: await this.getAccountAddress(),
            paymasterAPI,
        });
        const op = await account.createSignedUserOp(this._txDetails(tx));
        return await this._submit(op);
    }

    private async _submit(op: UserOperation): Promise<UserOpSendResult> {
        const userOpHash = await this._bundlerClient().sendUserOpToBundler(op);
        const receipt = await this.waitForReceipt(userOpHash);
        return { userOpHash, receipt };
    }

    private async _tokenInfoResolved(): Promise<{ address: string; decimals: number }> {
        if (this._tokenInfo == null) {
            const pm = new Contract(this.addresses.paymaster, ['function token() view returns (address)'], this.provider);
            const address: string = await pm.token();
            const erc20 = new Contract(address, ['function decimals() view returns (uint8)'], this.provider);
            const decimals = Number(await erc20.decimals());
            this._tokenInfo = { address, decimals };
        }
        return this._tokenInfo;
    }

    /** Unique permit nonce (Permit2 replay protection): timestamp-ms high bits + a counter. */
    private _newPermitNonce(): bigint {
        return (BigInt(Date.now()) << 16n) | BigInt(this._permitCounter++ & 0xffff);
    }
}
