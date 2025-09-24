import { SandboxContract } from '@ton/sandbox';
import { Address, beginCell, Cell, OpenedContract } from '@ton/ton';
import { ethers, isAddress as isEthereumAddress } from 'ethers';

import { JettonMinter, JettonMinterData, JettonWallet } from '../../artifacts/tonTypes';
import {
    ContractError,
    emptyContractError,
    insufficientBalanceError,
    missingDecimals,
    missingJettonDataError,
    unknownTokenTypeError,
} from '../errors';
import { Asset, IConfiguration } from '../interfaces';
import { JETTON_TRANSFER_FORWARD_TON_AMOUNT, TAC_DECIMALS, TON_DECIMALS } from '../sdk/Consts';
import {
    calculateAmount,
    calculateContractAddress,
    calculateRawAmount,
    generateFeeData,
    generateRandomNumberByTimestamp,
} from '../sdk/Utils';
import { Validator } from '../sdk/Validator';
import { AssetOpType } from '../structs/InternalStruct';
import {
    AssetType,
    EVMAddress,
    FeeParams,
    FTOriginAndData,
    TVMAddress,
    UserWalletBalanceExtended,
} from '../structs/Struct';
import { Origin } from '../structs/Struct';
import { readJettonMetadata } from '../wrappers/ContentUtils';
import { ERC20 } from '../../artifacts/tacTypes';

export class FT implements Asset {
    private _tvmAddress: Address;

    readonly type: AssetType = AssetType.FT;
    readonly origin: Origin;

    private _configuration: IConfiguration;
    private _jettonMinter: OpenedContract<JettonMinter> | SandboxContract<JettonMinter>;

    private _decimals: number;
    private _transferAmount: bigint;
    private _evmAddress?: string;

    get address(): string {
        return this._tvmAddress.toString({ bounceable: true });
    }

    static async getJettonData(configuration: IConfiguration, address: TVMAddress): Promise<JettonMinterData> {
        Validator.validateTVMAddress(address);
        const jetton = configuration.TONParams.contractOpener.open(
            configuration.artifacts.ton.wrappers.JettonMinter.createFromAddress(Address.parse(address)),
        );
        return jetton.getJettonData();
    }

    async getJettonData(): Promise<JettonMinterData> {
        return FT.getJettonData(this._configuration, this._tvmAddress.toString());
    }

    static async getOrigin(configuration: IConfiguration, address: TVMAddress): Promise<Origin> {
        const result = await this.getOriginAndData(configuration, address);
        return result.origin;
    }

    static async getOriginAndData(configuration: IConfiguration, address: TVMAddress): Promise<FTOriginAndData> {
        const { jettonMinterCode, crossChainLayerAddress, jettonWalletCode } = configuration.TONParams;

        const { code: thisCodeBOC } = await configuration.TONParams.contractOpener.getContractState(
            Address.parse(address),
        );
        if (!thisCodeBOC) {
            throw emptyContractError;
        }
        const thisCode = Cell.fromBoc(thisCodeBOC)[0];

        const jettonMinter = configuration.TONParams.contractOpener.open(
            configuration.artifacts.ton.wrappers.JettonMinter.createFromAddress(Address.parse(address)),
        );

        if (!jettonMinterCode.equals(thisCode)) {
            const jettonData = await jettonMinter.getJettonData();
            return { origin: Origin.TON, jettonMinter, jettonData };
        }

        const evmAddress = await jettonMinter.getEVMTokenAddress();

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
            const jettonData = await jettonMinter.getJettonData();
            return { origin: Origin.TON, jettonMinter, jettonData };
        }

        return { origin: Origin.TAC, jettonMinter, evmAddress };
    }

    static async getTVMAddress(configuration: IConfiguration, address: EVMAddress): Promise<string> {
        Validator.validateEVMAddress(address);

        const fromTVM = await configuration.TACParams.tokenUtils['exists(address)'](address);

        if (fromTVM) {
            const cclErc20Abi = configuration.artifacts.tac.compilationArtifacts.ERC20.abi;
            const erc20Token = new ethers.Contract(address, cclErc20Abi, configuration.TACParams.provider);

            const info = await erc20Token.getInfo();
            return info.tvmAddress;
        }

        const jettonMaster = configuration.artifacts.ton.wrappers.JettonMinter.createFromConfig(
            {
                totalSupply: 0n,
                adminAddress: Address.parse(configuration.TONParams.crossChainLayerAddress),
                jettonWalletCode: configuration.TONParams.jettonWalletCode,
                evmTokenAddress: address,
                content: beginCell().endCell(),
            },
            configuration.TONParams.jettonMinterCode,
        );

        return jettonMaster.address.toString();
    }

    static async getEVMAddress(configuration: IConfiguration, address: TVMAddress): Promise<string> {
        const tokenAddressString = Address.parse(address).toString({ bounceable: true });
        const origin = await FT.getOrigin(configuration, address);

        if (origin === Origin.TON) {
            return configuration.TACParams.tokenUtils.computeAddress(tokenAddressString);
        } else {
            const givenMinter = configuration.TONParams.contractOpener.open(
                configuration.artifacts.ton.wrappers.JettonMinter.createFromAddress(Address.parse(tokenAddressString)),
            );
            return givenMinter.getEVMTokenAddress();
        }
    }

    private constructor(address: TVMAddress, origin: Origin, configuration: IConfiguration, decimals: number) {
        this._tvmAddress = Address.parse(address);
        this._configuration = configuration;
        this._jettonMinter = this._configuration.TONParams.contractOpener.open(
            configuration.artifacts.ton.wrappers.JettonMinter.createFromAddress(this._tvmAddress),
        );
        this.origin = origin;
        this._transferAmount = 0n;
        this._decimals = decimals;
    }

    private static async getTACDecimals(configuration: IConfiguration, evmAddress: string): Promise<number> {
        const nativeTACAddress = await configuration.nativeTACAddress();

        if (evmAddress === nativeTACAddress) {
            return TAC_DECIMALS; // Native TAC always has 18 decimals
        }

        // For ERC20 contracts, get decimals from contract
        const erc20TokenAbi = configuration.artifacts.tac.compilationArtifacts.ERC20.abi;
        const erc20Token = new ethers.Contract(evmAddress, erc20TokenAbi, configuration.TACParams.provider) as unknown as ERC20;

        return Number(await erc20Token.decimals());
    }

    static async fromAddress(configuration: IConfiguration, address: TVMAddress | EVMAddress): Promise<FT> {
        const tvmAddress = isEthereumAddress(address) ? await this.getTVMAddress(configuration, address) : address;

        const {
            origin,
            jettonMinter,
            evmAddress: cachedEvmAddress,
            jettonData,
        } = await this.getOriginAndData(configuration, tvmAddress).catch((e) => {
            if (e instanceof ContractError) {
                const jettonMinter = configuration.TONParams.contractOpener.open(
                    configuration.artifacts.ton.wrappers.JettonMinter.createFromAddress(Address.parse(tvmAddress)),
                );
                return { origin: Origin.TAC, jettonMinter, evmAddress: undefined, jettonData: undefined };
            }
            throw e;
        });

        let decimals: number;
        let finalEvmAddress: string | undefined;

        if (origin === Origin.TON) {
            if (!jettonData) {
                throw missingJettonDataError;
            }
            const metadata = await readJettonMetadata(jettonData.content);
            const decimalsRaw = metadata.metadata.decimals ?? TON_DECIMALS;
            if (decimalsRaw === undefined) {
                throw missingDecimals;
            }
            decimals = Number(decimalsRaw);
        } else {
            if (isEthereumAddress(address)) {
                finalEvmAddress = address;
            } else {
                finalEvmAddress = cachedEvmAddress || (await jettonMinter.getEVMTokenAddress());
            }

            decimals = await this.getTACDecimals(configuration, finalEvmAddress);
        }

        const token = new FT(tvmAddress, origin, configuration, decimals);
        if (finalEvmAddress || isEthereumAddress(address)) {
            token._evmAddress = finalEvmAddress || address;
        }

        return token;
    }

    get rawAmount(): bigint {
        return this._transferAmount;
    }

    get clone(): FT {
        const ft = new FT(this._tvmAddress.toString(), this.origin, this._configuration, this._decimals);
        ft._transferAmount = this._transferAmount;
        ft._evmAddress = this._evmAddress;
        return ft;
    }

    withAmount(amount: number): FT {
        if (this._transferAmount > 0n) {
            const newToken = this.clone;
            newToken._transferAmount = calculateRawAmount(amount, this._decimals);
            return newToken;
        }

        this._transferAmount = calculateRawAmount(amount, this._decimals);
        return this;
    }

    withRawAmount(rawAmount: bigint): FT {
        if (this._transferAmount > 0n) {
            const newToken = this.clone;
            newToken._transferAmount = rawAmount;
            return newToken;
        }
        this._transferAmount = rawAmount;
        return this;
    }

    addAmount(amount: number): FT {
        this._transferAmount = this._transferAmount + calculateRawAmount(amount, this._decimals);
        return this;
    }

    addRawAmount(rawAmount: bigint): FT {
        this._transferAmount = this._transferAmount + rawAmount;
        return this;
    }

    async getDecimals(): Promise<number> {
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
                this._configuration.artifacts.ton.wrappers.JettonMinter.createFromAddress(
                    Address.parse(tokenAddressString),
                ),
            );
            this._evmAddress = await givenMinter.getEVMTokenAddress();
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
            this._configuration.artifacts.ton.wrappers.JettonWallet.createFromAddress(Address.parse(walletAddress)),
        );
    }

    async getUserWalletAddress(userAddress: string): Promise<string> {
        return (await this._jettonMinter.getWalletAddress(Address.parse(userAddress))).toString({ bounceable: true });
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

        return this._configuration.artifacts.ton.wrappers.JettonWallet.transferMessage(
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
        return this._configuration.artifacts.ton.wrappers.JettonWallet.burnMessage(
            rawAmount,
            notificationReceiverAddress,
            crossChainTonAmount,
            feeData,
            evmData,
            queryId,
        );
    }
}
