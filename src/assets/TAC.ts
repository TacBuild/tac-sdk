import type { Cell } from '@ton/ton';

import { insufficientBalanceError } from '../errors';
import { Asset, IConfiguration } from '../interfaces';
import { Validator } from '../sdk/Validator';
import { AssetFeeMode, AssetType, BlockchainType, GeneratePayloadParams, Origin } from '../structs/Struct';
import { FT } from './FT';

export class TAC implements Asset {
    readonly type: AssetType = AssetType.FT;
    readonly origin: Origin = Origin.TAC;
    readonly feeMode: AssetFeeMode = AssetFeeMode.TAC_ORIGINAL;

    private constructor(
        private readonly _configuration: IConfiguration,
        private readonly _evmAddress: string,
        private _wrappedAsset: FT,
    ) {}

    static async create(configuration: IConfiguration): Promise<TAC> {
        const evmAddress = await configuration.nativeTACAddress();
        const wrappedAsset = await FT.fromAddress(configuration, evmAddress);

        return new TAC(configuration, evmAddress, wrappedAsset);
    }

    get address(): string {
        return this._wrappedAsset.address;
    }

    get rawAmount(): bigint {
        return this._wrappedAsset.rawAmount;
    }

    get clone(): TAC {
        return new TAC(this._configuration, this._evmAddress, this._wrappedAsset.clone as FT);
    }

    withAmount(amount: number): TAC {
        const nextWrappedAsset = this._wrappedAsset.withAmount(amount) as FT;

        if (nextWrappedAsset === this._wrappedAsset) {
            return this;
        }

        return new TAC(this._configuration, this._evmAddress, nextWrappedAsset);
    }

    withRawAmount(rawAmount: bigint): TAC {
        const nextWrappedAsset = this._wrappedAsset.withRawAmount(rawAmount) as FT;

        if (nextWrappedAsset === this._wrappedAsset) {
            return this;
        }

        return new TAC(this._configuration, this._evmAddress, nextWrappedAsset);
    }

    addAmount(amount: number): TAC {
        this._wrappedAsset = this._wrappedAsset.addAmount(amount) as FT;
        return this;
    }

    addRawAmount(rawAmount: bigint): TAC {
        this._wrappedAsset = this._wrappedAsset.addRawAmount(rawAmount) as FT;
        return this;
    }

    async getEVMAddress(): Promise<string> {
        return this._evmAddress;
    }

    async getTVMAddress(): Promise<string> {
        return this.address;
    }

    generatePayload(params: GeneratePayloadParams): Cell {
        return this._wrappedAsset.generatePayload(params);
    }

    async checkCanBeTransferredBy(
        userAddress: string,
        blockchainType: BlockchainType = BlockchainType.TON,
    ): Promise<void> {
        if ((await this.getBalanceOf(userAddress, blockchainType)) < this.rawAmount) {
            throw insufficientBalanceError(this.address);
        }
    }

    async getBalanceOf(userAddress: string, blockchainType: BlockchainType = BlockchainType.TON): Promise<bigint> {
        if (blockchainType === BlockchainType.TAC) {
            Validator.validateEVMAddress(userAddress);
            return this._configuration.TACParams.provider.getBalance(userAddress);
        }

        return this._wrappedAsset.getBalanceOf(userAddress, blockchainType);
    }
}
