import { Address, beginCell, Cell } from '@ton/ton';

import { insufficientBalanceError } from '../errors';
import { TON_SYMBOL } from '../sdk/Consts';
import { calculateRawAmount, generateFeeData, generateRandomNumberByTimestamp } from '../sdk/Utils';
import type { ISender } from '../sender';
import type { ShardTransaction } from '../structs/InternalStruct';
import { IAsset, IConfiguration } from '../interfaces';
import { AssetType, FeeParams } from '../structs/Struct';

export class TON implements IAsset {
    readonly address: string;
    readonly type: AssetType = AssetType.FT;

    private _rawAmount: bigint;
    private _config: IConfiguration;

    constructor(config: IConfiguration) {
        this.address = '';
        this._config = config;
        this._rawAmount = 0n;
    }

    static create(config: IConfiguration): TON {
        return new TON(config);
    }

    get rawAmount(): bigint {
        return this._rawAmount;
    }

    get clone(): TON {
        const ton = new TON(this._config);
        ton._rawAmount = this._rawAmount;
        return ton;
    }

    async withAmount(amount: { rawAmount: bigint } | { amount: number }): Promise<TON> {
        if (this._rawAmount > 0n) {
            // clone token if withAmount set before to avoid changing the original token
            const newToken = this.clone;
            newToken._rawAmount = 'rawAmount' in amount ? amount.rawAmount : calculateRawAmount(amount.amount, 9);
            return newToken;
        }

        if ('rawAmount' in amount) {
            this._rawAmount = amount.rawAmount;
        } else {
            this._rawAmount = calculateRawAmount(amount.amount, 9);
        }
        return this;
    }

    async addAmount(amount: { rawAmount: bigint } | { amount: number }): Promise<TON> {
        if ('rawAmount' in amount) {
            this._rawAmount = this._rawAmount + amount.rawAmount;
        } else {
            this._rawAmount = this._rawAmount + calculateRawAmount(amount.amount, 9);
        }
        return this;
    }

    async getEVMAddress(): Promise<string> {
        return this._config.TACParams.tokenUtils.computeAddress(this._config.nativeTONAddress);
    }

    async getTVMAddress(): Promise<string> {
        return '';
    }

    async generatePayload(params: {
        excessReceiver: string;
        evmData: Cell;
        crossChainTonAmount?: bigint;
        forwardFeeTonAmount?: bigint;
        feeParams?: FeeParams;
    }): Promise<Cell> {
        const { excessReceiver, evmData, feeParams } = params;

        const queryId = generateRandomNumberByTimestamp().randomNumber;
        const feeData = generateFeeData(feeParams);
        return beginCell()
            .storeUint(this._config.artifacts.ton.wrappers.CrossChainLayerOpCodes.anyone_tvmMsgToEVM, 32)
            .storeUint(queryId, 64)
            .storeUint(this._config.artifacts.ton.wrappers.OperationType.tonTransfer, 32)
            .storeCoins(this._rawAmount)
            .storeMaybeRef(feeData)
            .storeAddress(Address.parse(excessReceiver))
            .storeMaybeRef(evmData)
            .endCell();
    }

    async getUserBalance(userAddress: string): Promise<bigint> {
        return (await this._config.TONParams.contractOpener.getContractState(Address.parse(userAddress))).balance;
    }

    static async checkBalance(
        sender: ISender,
        config: IConfiguration,
        transactions: ShardTransaction[],
    ): Promise<void> {
        const totalValue = transactions.reduce(
            (acc, transaction) => acc + transaction.messages.reduce((acc, message) => acc + message.value, 0n),
            0n,
        );
        const balance = await sender.getBalance(config.TONParams.contractOpener);
        if (balance < totalValue) {
            throw insufficientBalanceError(TON_SYMBOL);
        }
    }

    async checkCanBeTransferredBy(userAddress: string): Promise<void> {
        const balance = await this.getUserBalance(userAddress);
        if (balance < this._rawAmount) {
            throw insufficientBalanceError(TON_SYMBOL);
        }
    }

    async getBalanceOf(userAddress: string): Promise<bigint> {
        return this.getUserBalance(userAddress);
    }
}
