import { BigNumberish, Contract } from 'ethers';

import { TacAccountABI, TacAccountFactoryABI } from './abi';
import { BaseAccountAPI, BaseApiParams } from './BaseAccountAPI';
import {
    buildPermitBinding,
    Ed25519Signer,
    packRawEd25519Signature,
    packTonConnectUserOpSignature,
    TonConnectSigner,
} from './Ed25519';
import { FactoryParams } from './internal/userOp';

const ZERO_HASH = '0x' + '00'.repeat(32);

/**
 * Constructor params for {@link TacAccountAPI}. Exactly ONE of `signer` or
 * `tonConnectSigner` must be provided.
 *
 * @param publicKey        Ed25519 public key as 32-byte hex (0x-prefixed). The
 *                         deterministic AA address is derived from this key alone.
 * @param signer           raw Ed25519 signer (returns `(r, s)` over a 32-byte message).
 * @param tonConnectSigner TonConnect-wallet signer.
 * @param factoryAddress   deployed `TacAccountFactory` address.
 */
export interface TacAccountApiParams extends BaseApiParams {
    publicKey: string;
    signer?: Ed25519Signer;
    tonConnectSigner?: TonConnectSigner;
    factoryAddress: string;
}

/**
 * BaseAccountAPI implementation for TAC's Ed25519 + beacon-proxy accounts.
 *
 *   - account address is derived from the Ed25519 public key only
 *     (`salt = keccak256(publicKey)` inside the factory)
 *   - factoryData is `TacAccountFactory.getOrCreateAccount(publicKey)`
 *   - signature is Ed25519 in the 64-byte raw format (this class), or the 96-byte /
 *     TonConnect formats via {@link buildSignedUserOpWithPermit} for paymaster Mode 1
 */
export class TacAccountAPI extends BaseAccountAPI {
    publicKey: string;
    signer?: Ed25519Signer;
    tonConnectSigner?: TonConnectSigner;
    factoryAddress: string;

    private accountContract?: Contract;
    private factoryContract?: Contract;

    constructor(params: TacAccountApiParams) {
        super(params);
        if ((params.signer == null) === (params.tonConnectSigner == null)) {
            throw new Error('TacAccountAPI requires exactly one of `signer` or `tonConnectSigner`');
        }
        this.publicKey = params.publicKey;
        this.signer = params.signer;
        this.tonConnectSigner = params.tonConnectSigner;
        this.factoryAddress = params.factoryAddress;
    }

    private async _getAccountContract(): Promise<Contract> {
        if (this.accountContract == null) {
            const addr = await this.getAccountAddress();
            this.accountContract = new Contract(addr, TacAccountABI, this.provider);
        }
        return this.accountContract;
    }

    private _getFactory(): Contract {
        if (this.factoryContract == null) {
            this.factoryContract = new Contract(this.factoryAddress, TacAccountFactoryABI, this.provider);
        }
        return this.factoryContract;
    }

    /** Derive the deterministic account address directly from the factory's view. */
    async getCounterFactualAddress(): Promise<string> {
        return await this._getFactory().getAccountAddress.staticCall(this.publicKey);
    }

    /** initCode for an undeployed account: factory + `getOrCreateAccount(publicKey)` calldata. */
    async getFactoryData(): Promise<FactoryParams | null> {
        const factory = this._getFactory();
        return {
            factory: this.factoryAddress,
            factoryData: factory.interface.encodeFunctionData('getOrCreateAccount', [this.publicKey]),
        };
    }

    /** Sequential nonce from the deployed account, or 0 if still phantom. */
    async getNonce(): Promise<bigint> {
        if (await this.checkAccountPhantom()) {
            return 0n;
        }
        const accountContract = await this._getAccountContract();
        return await accountContract.getFunction('getNonce()').staticCall();
    }

    /** Encode a single call as `TacBaseAccount.execute(target, value, data)` calldata. */
    async encodeExecute(target: string, value: BigNumberish, data: string): Promise<string> {
        const accountContract = await this._getAccountContract();
        return accountContract.interface.encodeFunctionData('execute', [target, value, data]);
    }

    /**
     * Sign userOpHash with the configured signer (64-byte raw, or TonConnect with
     * `permitHash = 0`). For paymaster Mode 1 use {@link buildSignedUserOpWithPermit}.
     */
    async signUserOpHash(userOpHash: string): Promise<string> {
        if (this.signer != null) {
            const sig = await this.signer(userOpHash);
            return packRawEd25519Signature(sig);
        }
        if (this.tonConnectSigner != null) {
            const binding = buildPermitBinding(userOpHash, ZERO_HASH);
            const parts = await this.tonConnectSigner(binding);
            return packTonConnectUserOpSignature(parts, ZERO_HASH);
        }
        throw new Error('TacAccountAPI: no signer configured');
    }
}
