import { Address, beginCell, Cell } from '@ton/ton';

import { insufficientBalanceError } from '../errors';
import { Asset, IConfiguration } from '../interfaces';
import { TON_SYMBOL } from '../sdk/Consts';
import { calculateRawAmount, generateFeeData, generateRandomNumberByTimestamp } from '../sdk/Utils';
import type { SenderAbstraction } from '../sender';
import type { ShardTransaction } from '../structs/InternalStruct';
import { AssetType, FeeParams } from '../structs/Struct';

export class TON implements Asset {
    readonly address: string;
    readonly type: AssetType = AssetType.FT;

    private evmAddress: string;
    private _rawAmount: bigint;
    private _config: IConfiguration;

    constructor(config: IConfiguration) {
        this.address = '';
        this._config = config;
        this._rawAmount = 0n;
        this.evmAddress = '';
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

    withAmount(amount: number): TON {
        if (this._rawAmount > 0n) {
            const newToken = this.clone;
            newToken._rawAmount = calculateRawAmount(amount, 9);
            return newToken;
        }
        this._rawAmount = calculateRawAmount(amount, 9);
        return this;
    }

    withRawAmount(rawAmount: bigint): TON {
        if (this._rawAmount > 0n) {
            const newToken = this.clone;
            newToken._rawAmount = rawAmount;
            return newToken;
        }
        this._rawAmount = rawAmount;
        return this;
    }

    addAmount(amount: number): TON {
        this._rawAmount = this._rawAmount + calculateRawAmount(amount, 9);
        return this;
    }

    addRawAmount(rawAmount: bigint): TON {
        this._rawAmount = this._rawAmount + rawAmount;
        return this;
    }

    async getEVMAddress(): Promise<string> {
        if (this.evmAddress === '') {
            this.evmAddress = await this._config.TACParams.tokenUtils.computeAddress(this._config.nativeTONAddress);
        }
        return this.evmAddress;
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
            .storeUint(this._config.artifacts.ton.wrappers.MsgType.tonTransfer, 32)
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
        sender: SenderAbstraction,
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
