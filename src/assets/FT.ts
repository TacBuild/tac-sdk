import { SandboxContract } from '@ton/sandbox';
import { Address, beginCell, Cell, OpenedContract } from '@ton/ton';
import { isAddress as isEthereumAddress } from 'ethers';

import { ContractError, emptyContractError, insufficientBalanceError, unknownTokenTypeError } from '../errors';
import { Asset, ContractOpener,IConfiguration } from '../interfaces';
import { JETTON_TRANSFER_FORWARD_TON_AMOUNT } from '../sdk/Consts';
import {
    calculateAmount,
    calculateContractAddress,
    calculateRawAmount,
    generateFeeData,
    generateRandomNumberByTimestamp,
} from '../sdk/Utils';
import { Validator } from '../sdk/Validator';
import { AssetOpType } from '../structs/InternalStruct';
import { AssetType, EVMAddress, FeeParams, TVMAddress, UserWalletBalanceExtended } from '../structs/Struct';
import { Origin } from '../structs/Struct';
import { JettonMaster, JettonMasterData } from '../wrappers/JettonMaster';
import { JettonWallet } from '../wrappers/JettonWallet';

export class FT implements Asset {
    private _tvmAddress: Address;

    readonly type: AssetType = AssetType.FT;
    readonly origin: Origin;

    private _configuration: IConfiguration;
    private _jettonMinter: OpenedContract<JettonMaster> | SandboxContract<JettonMaster>;

    private _decimals?: number;
    private _transferAmount: bigint;
    private _evmAddress?: string;

    get address(): string {
        return this._tvmAddress.toString({ bounceable: true });
    }

    static async getJettonData(contractOpener: ContractOpener, address: TVMAddress): Promise<JettonMasterData> {
        Validator.validateTVMAddress(address);
        const jetton = contractOpener.open(JettonMaster.createFromAddress(Address.parse(address)));
        return jetton.getJettonData();
    }

    async getJettonData(): Promise<JettonMasterData> {
        return FT.getJettonData(this._configuration.TONParams.contractOpener, this._tvmAddress.toString());
    }

    static async getOrigin(configuration: IConfiguration, address: TVMAddress): Promise<Origin> {
        const { jettonMinterCode, crossChainLayerAddress, jettonWalletCode } = configuration.TONParams;

        const { code: thisCodeBOC } = await configuration.TONParams.contractOpener.getContractState(
            Address.parse(address),
        );
        if (!thisCodeBOC) {
            throw emptyContractError;
        }
        const thisCode = Cell.fromBoc(thisCodeBOC)[0];

        if (!jettonMinterCode.equals(thisCode)) {
            return Origin.TON;
        }

        const jettonMinter = configuration.TONParams.contractOpener.open(
            JettonMaster.createFromAddress(Address.parse(address)),
        );
        const evmAddress = await jettonMinter.getEVMAddress();

        const expectedMinterAddress = await calculateContractAddress(
            jettonMinterCode,
            beginCell()
                .storeCoins(0)
                .storeAddress(Address.parse(crossChainLayerAddress))
                .storeAddress(null)
                .storeRef(beginCell().endCell())
                .storeRef(jettonWalletCode)
                .storeStringTail(evmAddress)
                .endCell(),
        );

        if (!expectedMinterAddress.equals(Address.parse(address))) {
            return Origin.TON;
        }

        return Origin.TAC;
    }

    static async getTVMAddress(configuration: IConfiguration, address: EVMAddress): Promise<string> {
        Validator.validateEVMAddress(address);

        // If token is TON native
        const fromTVM = await configuration.TACParams.tokenUtils['exists(address)'](address);

        if (fromTVM) {
            const erc20Token = configuration.artifacts.tac.wrappers.CrossChainLayerERC20FactoryTAC.connect(
                address,
                configuration.TACParams.provider,
            );

            const info = await erc20Token.getInfo();
            return info.tvmAddress;
        }

        // If token is TAC native
        const jettonMaster = JettonMaster.createFromConfig({
            evmTokenAddress: address,
            crossChainLayerAddress: Address.parse(configuration.TONParams.crossChainLayerAddress),
            code: configuration.TONParams.jettonMinterCode,
            walletCode: configuration.TONParams.jettonWalletCode,
        });

        return jettonMaster.address.toString();
    }

    static async getEVMAddress(configuration: IConfiguration, address: TVMAddress): Promise<string> {
        const tokenAddressString = Address.parse(address).toString({ bounceable: true });
        const origin = await FT.getOrigin(configuration, address);

        if (origin === Origin.TON) {
            return configuration.TACParams.tokenUtils.computeAddress(tokenAddressString);
        } else {
            const givenMinter = configuration.TONParams.contractOpener.open(
                new JettonMaster(Address.parse(tokenAddressString)),
            );
            return givenMinter.getEVMAddress();
        }
    }

    private constructor(address: TVMAddress, origin: Origin, configuration: IConfiguration) {
        this._tvmAddress = Address.parse(address);
        this._configuration = configuration;
        this._jettonMinter = this._configuration.TONParams.contractOpener.open(new JettonMaster(this._tvmAddress));
        this.origin = origin;
        this._transferAmount = 0n;
    }

    static async fromAddress(configuration: IConfiguration, address: TVMAddress | EVMAddress): Promise<FT> {
        const tvmAddress = isEthereumAddress(address) ? await this.getTVMAddress(configuration, address) : address;

        const origin = await FT.getOrigin(configuration, tvmAddress).catch((e) => {
            if (e instanceof ContractError) {
                return Origin.TAC;
            }
            throw e;
        });

        const token = new FT(tvmAddress, origin, configuration);
        if (isEthereumAddress(address)) {
            token._evmAddress = address;
        }

        return token;
    }

    get rawAmount(): bigint {
        return this._transferAmount;
    }

    get clone(): FT {
        const ft = new FT(this._tvmAddress.toString(), this.origin, this._configuration);
        ft._transferAmount = this._transferAmount;
        ft._evmAddress = this._evmAddress;
        ft._decimals = this._decimals;
        return ft;
    }

    async withAmount(amount: { rawAmount: bigint } | { amount: number }): Promise<FT> {
        if (this._transferAmount > 0n) {
            // clone token if withAmount set before to avoid changing the original token
            const newToken = this.clone;
            newToken._transferAmount =
                'rawAmount' in amount ? amount.rawAmount : calculateRawAmount(amount.amount, await this.getDecimals());
            return newToken;
        }

        if ('rawAmount' in amount) {
            this._transferAmount = amount.rawAmount;
        } else {
            const decimals = await this.getDecimals();
            this._transferAmount = calculateRawAmount(amount.amount, decimals);
        }

        return this;
    }

    async addAmount(amount: { rawAmount: bigint } | { amount: number }): Promise<FT> {
        if ('rawAmount' in amount) {
            this._transferAmount = this._transferAmount + amount.rawAmount;
        } else {
            const decimals = await this.getDecimals();
            this._transferAmount = this._transferAmount + calculateRawAmount(amount.amount, decimals);
        }
        return this;
    }

    async getDecimals(): Promise<number> {
        if (!this._decimals) {
            const decimalsRaw = (await this._jettonMinter.getJettonData()).content.metadata.decimals;
            this._decimals = decimalsRaw ? Number(decimalsRaw) : 9;
        }
        return this._decimals;
    }

    async getEVMAddress(): Promise<string> {
        if (this._evmAddress) {
            return this._evmAddress;
        }

        const tokenAddressString = this._tvmAddress.toString({ bounceable: true });

        if (this.origin === Origin.TON) {
            this._evmAddress = await this._configuration.TACParams.tokenUtils.computeAddress(tokenAddressString);
        } else if (this.origin === Origin.TAC) {
            const givenMinter = this._configuration.TONParams.contractOpener.open(
                new JettonMaster(Address.parse(tokenAddressString)),
            );
            this._evmAddress = await givenMinter.getEVMAddress();
        } else {
            throw unknownTokenTypeError(tokenAddressString, 'Token origin is neither TON nor TAC');
        }

        return this._evmAddress;
    }

    async getTVMAddress(): Promise<string> {
        return this._tvmAddress.toString({ bounceable: true });
    }

    async generatePayload(params: {
        excessReceiver: string;
        evmData: Cell;
        crossChainTonAmount?: bigint;
        forwardFeeTonAmount?: bigint;
        feeParams?: FeeParams;
    }): Promise<Cell> {
        const { excessReceiver, evmData, crossChainTonAmount = 0n, forwardFeeTonAmount = 0n, feeParams } = params;

        const feeData = generateFeeData(feeParams);

        let payload: Cell;
        switch (this.opType) {
            case AssetOpType.JETTON_BURN:
                payload = this.getBurnPayload(
                    this._transferAmount,
                    this._configuration.TONParams.crossChainLayerAddress,
                    evmData,
                    crossChainTonAmount,
                    feeData,
                );
                break;
            case AssetOpType.JETTON_TRANSFER:
                payload = this.getTransferPayload(
                    this._transferAmount,
                    this._configuration.TONParams.jettonProxyAddress,
                    excessReceiver,
                    evmData,
                    crossChainTonAmount,
                    forwardFeeTonAmount,
                    feeData,
                );
                break;
        }

        return payload;
    }

    get opType(): AssetOpType.JETTON_BURN | AssetOpType.JETTON_TRANSFER {
        return this.origin === Origin.TAC ? AssetOpType.JETTON_BURN : AssetOpType.JETTON_TRANSFER;
    }

    async getWallet(userAddress: string): Promise<OpenedContract<JettonWallet> | SandboxContract<JettonWallet>> {
        const walletAddress = await this.getUserWalletAddress(userAddress);
        return this._configuration.TONParams.contractOpener.open(
            JettonWallet.createFromAddress(Address.parse(walletAddress)),
        );
    }

    async getUserWalletAddress(userAddress: string): Promise<string> {
        return this._jettonMinter.getWalletAddress(userAddress);
    }

    async getUserBalance(userAddress: string): Promise<bigint> {
        const wallet = await this.getWallet(userAddress);
        return BigInt(await wallet.getJettonBalance());
    }

    async getUserBalanceExtended(userAddress: string): Promise<UserWalletBalanceExtended> {
        const masterState = await this._configuration.TONParams.contractOpener.getContractState(this._tvmAddress);

        if (masterState.state !== 'active') {
            return { exists: false };
        }

        const wallet = await this.getWallet(userAddress);
        const rawAmount = await wallet.getJettonBalance();
        const decimals = await this.getDecimals();

        return {
            rawAmount,
            decimals,
            amount: calculateAmount(rawAmount, decimals),
            exists: true,
        };
    }

    async checkBalance(userAddress: string): Promise<void> {
        const balance = await this.getUserBalance(userAddress);
        if (balance < this._transferAmount) {
            throw insufficientBalanceError(this._tvmAddress.toString());
        }
    }

    async checkCanBeTransferredBy(userAddress: string): Promise<void> {
        await this.checkBalance(userAddress);
    }

    async getBalanceOf(userAddress: string): Promise<bigint> {
        return this.getUserBalance(userAddress);
    }

    private getTransferPayload(
        rawAmount: bigint,
        notificationReceiverAddress: string,
        responseAddress: string,
        evmData: Cell,
        crossChainTonAmount: bigint,
        forwardFeeAmount: bigint,
        feeData?: Cell,
    ): Cell {
        const queryId = generateRandomNumberByTimestamp().randomNumber;

        return JettonWallet.transferMessage(
            rawAmount,
            notificationReceiverAddress,
            responseAddress,
            JETTON_TRANSFER_FORWARD_TON_AMOUNT + forwardFeeAmount + crossChainTonAmount,
            crossChainTonAmount,
            feeData,
            evmData,
            queryId,
        );
    }

    private getBurnPayload(
        rawAmount: bigint,
        notificationReceiverAddress: string,
        evmData: Cell,
        crossChainTonAmount: bigint,
        feeData?: Cell,
    ): Cell {
        const queryId = generateRandomNumberByTimestamp().randomNumber;
        return JettonWallet.burnMessage(
            rawAmount,
            notificationReceiverAddress,
            crossChainTonAmount,
            feeData,
            evmData,
            queryId,
        );
    }
}
