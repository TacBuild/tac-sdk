import {Address, address, beginCell, Cell, toNano} from '@ton/ton';
import {AbstractProvider, ethers, Interface, InterfaceAbi, keccak256, toUtf8Bytes} from 'ethers';

import type {SenderAbstraction} from '../sender';
// import structs
import {
    AssetBridgingData,
    AssetOpType,
    EvmProxyMsg,
    JettonBridgingData,
    JettonBurnData,
    JettonTransferData,
    Network,
    SDKParams,
    ShardMessage,
    ShardTransaction,
    TransactionLinker, ContractOpener
} from '../structs/Struct';
// jetton imports
import {JettonMaster} from '../wrappers/JettonMaster';
import {JettonWallet} from '../wrappers/JettonWallet';
// ton settings
import {Settings} from '../wrappers/Settings';
import {
    JETTON_TRANSFER_FORWARD_TON_AMOUNT,
    MAINNET_TAC_RPC_ENDPOINT,
    TESTNET_TAC_RPC_ENDPOINT,
    TRANSACTION_TON_AMOUNT,
} from './Consts';
import {
    buildEvmDataCell,
    calculateContractAddress,
    calculateEVMTokenAddress,
    generateRandomNumberByTimestamp,
    generateTransactionLinker,
    sleep,
    validateEVMAddress,
    validateTVMAddress,
} from './Utils';
import {mainnet, testnet} from '@tonappchain/artifacts';
import {emptyContractError} from '../errors';
import {liteClientOpener} from "../adapters/contractOpener";

const DEFAULT_DELAY = 3;

export class TacSdk {
    private isInited: boolean = false;
    readonly network: Network;
    readonly delay: number;
    readonly artifacts: typeof testnet | typeof mainnet;

    private TONParams: {
        contractOpener?: ContractOpener;
        settingsAddress: string;
        jettonProxyAddress?: string;
        crossChainLayerAddress?: string;
        jettonMinterCode?: Cell;
        jettonWalletCode?: Cell;
    };

    private TACParams: {
        provider: AbstractProvider;
        settings: ethers.Contract,
        abiCoder: ethers.AbiCoder,
        crossChainLayerABI: Interface | InterfaceAbi,
        crossChainLayer?: ethers.Contract,
    };

    constructor(sdkParams: SDKParams) {
        this.network = sdkParams.network;
        this.delay = sdkParams.delay ?? DEFAULT_DELAY;
        this.artifacts = this.network === Network.Testnet ? testnet : mainnet;


        this.TONParams = {
            contractOpener: sdkParams.TONParams?.contractOpener,
            settingsAddress: sdkParams.TONParams?.settingsAddress ?? this.artifacts.ton.addresses.TON_SETTINGS_ADDRESS
        };

        const TACProvider = sdkParams.TACParams?.provider
            ?? ethers.getDefaultProvider(this.network === Network.Testnet ? TESTNET_TAC_RPC_ENDPOINT : MAINNET_TAC_RPC_ENDPOINT);

        this.TACParams = {
            provider: TACProvider,
            abiCoder: new ethers.AbiCoder(),
            settings: new ethers.Contract(
                sdkParams.TACParams?.settingsAddress ?? this.artifacts.tac.addresses.TAC_SETTINGS_ADDRESS,
                this.artifacts.tac.compilationArtifacts.Settings.abi,
                TACProvider,
            ),
            crossChainLayerABI: sdkParams.TACParams?.crossChainLayerABI ?? this.artifacts.tac.compilationArtifacts.CrossChainLayer.abi
        };

    }

    async init(): Promise<void> {
        const cclAddress: string = await this.TACParams.settings.getAddressSetting(
            keccak256(toUtf8Bytes('CrossChainLayerAddress')),
        );

        this.TACParams.crossChainLayer = new ethers.Contract(
            cclAddress,
            this.TACParams.crossChainLayerABI,
            this.TACParams.provider,
        );

        if (!this.TONParams.contractOpener) {
            this.TONParams.contractOpener = await liteClientOpener({network: this.network})
        }

        const settings = this.TONParams.contractOpener.open(new Settings(Address.parse(this.TONParams.settingsAddress)));

        this.TONParams.jettonProxyAddress = await settings.getAddressSetting('JettonProxyAddress');
        await sleep(this.delay * 1000);

        this.TONParams.crossChainLayerAddress = await settings.getAddressSetting('CrossChainLayerAddress');
        await sleep(this.delay * 1000);

        this.TONParams.jettonMinterCode = await settings.getCellSetting('JETTON_MINTER_CODE');
        await sleep(this.delay * 1000);

        this.TONParams.jettonWalletCode = await settings.getCellSetting('JETTON_WALLET_CODE');
        await sleep(this.delay * 1000);

        this.isInited = true;
    }

    get nativeTONAddress(): string {
        return 'NONE';
    }

    get nativeTACAddress(): Promise<string> {
        return this.TACParams.crossChainLayer!.NATIVE_TOKEN_ADDRESS.staticCall();
    }

    async getUserJettonWalletAddress(userAddress: string, tokenAddress: string): Promise<string> {
        const jettonMaster = this.TONParams.contractOpener!.open(new JettonMaster(Address.parse(tokenAddress)));
        return await jettonMaster.getWalletAddress(userAddress);
    }

    async getUserJettonBalance(userAddress: string, tokenAddress: string): Promise<number> {
        const jettonMaster = this.TONParams.contractOpener!.open(new JettonMaster(Address.parse(tokenAddress)));
        const userJettonWalletAddress = await jettonMaster.getWalletAddress(userAddress);
        await sleep(this.delay * 1000);

        const userJettonWallet = this.TONParams.contractOpener!.open(new JettonWallet(Address.parse(userJettonWalletAddress)));
        return await userJettonWallet.getJettonBalance();
    }

    private getJettonTransferPayload(
        jettonData: JettonTransferData,
        responseAddress: string,
        evmData: Cell,
        crossChainTonAmount: number,
    ): Cell {
        const queryId = generateRandomNumberByTimestamp().randomNumber;
        return JettonWallet.transferMessage(
            jettonData.amount,
            this.TONParams.jettonProxyAddress!,
            responseAddress,
            JETTON_TRANSFER_FORWARD_TON_AMOUNT,
            crossChainTonAmount,
            evmData,
            queryId,
        );
    }

    private getJettonBurnPayload(jettonData: JettonBurnData, evmData: Cell, crossChainTonAmount: number): Cell {
        const queryId = generateRandomNumberByTimestamp().randomNumber;
        return JettonWallet.burnMessage(
            jettonData.amount,
            jettonData.notificationReceiverAddress,
            crossChainTonAmount,
            evmData,
            queryId,
        );
    }

    private getTonTransferPayload(responseAddress: string, evmData: Cell, crossChainTonAmount: number): Cell {
        const queryId = generateRandomNumberByTimestamp().randomNumber;
        return beginCell()
            .storeUint(this.artifacts.ton.wrappers.CrossChainLayerOpCodes.anyone_l1MsgToL2, 32)
            .storeUint(queryId, 64)
            .storeUint(this.artifacts.ton.wrappers.OperationType.tonTransfer, 32)
            .storeCoins(toNano(crossChainTonAmount.toFixed(9)))
            .storeAddress(Address.parse(responseAddress))
            .storeMaybeRef(evmData)
            .endCell();
    }

    private async getJettonOpType(asset: JettonBridgingData): Promise<AssetOpType> {
        const {code: givenMinterCodeBOC} = await this.TONParams.contractOpener!.getContractState(address(asset.address));
        if (!givenMinterCodeBOC) {
            throw emptyContractError;
        }
        const givenMinterCode = Cell.fromBoc(givenMinterCodeBOC)[0];
        await sleep(this.delay * 1000);

        if (!this.TONParams.jettonMinterCode!.equals(givenMinterCode)) {
            return AssetOpType.JettonTransfer;
        }

        const givenMinter = this.TONParams.contractOpener!.open(new JettonMaster(address(asset.address)));
        const l2Address = await givenMinter.getL2Address();
        await sleep(this.delay * 1000);

        const expectedMinterAddress = await calculateContractAddress(
            this.TONParams.jettonMinterCode!,
            beginCell()
                .storeCoins(0)
                .storeAddress(address(this.TONParams.crossChainLayerAddress!))
                .storeRef(beginCell().endCell())
                .storeRef(this.TONParams.jettonWalletCode!)
                .storeStringTail(l2Address)
                .endCell(),
        );

        if (!expectedMinterAddress.equals(givenMinter.address)) {
            return AssetOpType.JettonTransfer;
        }

        return AssetOpType.JettonBurn;
    }

    private aggregateJettons(assets?: AssetBridgingData[]): {
        jettons: JettonBridgingData[];
        crossChainTonAmount: number;
    } {
        const uniqueAssetsMap: Map<string, number> = new Map();
        let crossChainTonAmount = 0;

        assets?.forEach((asset) => {
            if (asset.amount <= 0) return;

            if (asset.address) {
                validateTVMAddress(asset.address);
                uniqueAssetsMap.set(asset.address, (uniqueAssetsMap.get(asset.address) || 0) + asset.amount);
            } else {
                crossChainTonAmount += asset.amount;
            }
        });

        const jettons: JettonBridgingData[] = Array.from(uniqueAssetsMap.entries()).map(([address, amount]) => ({
            address,
            amount,
        }));

        return {
            jettons,
            crossChainTonAmount,
        };
    }

    private async generatePayload(
        jetton: JettonBridgingData,
        caller: string,
        evmData: Cell,
        crossChainTonAmount: number,
    ) {
        const opType = await this.getJettonOpType(jetton);
        await sleep(this.delay * 1000);
        console.log(`***** Jetton ${jetton.amount} requires ${opType} operation`);

        let payload: Cell;
        switch (opType) {
            case AssetOpType.JettonBurn:
                payload = this.getJettonBurnPayload(
                    {
                        notificationReceiverAddress: this.TONParams.crossChainLayerAddress!,
                        ...jetton,
                    },
                    evmData,
                    crossChainTonAmount,
                );
                break;
            case AssetOpType.JettonTransfer:
                payload = this.getJettonTransferPayload(jetton, caller, evmData, crossChainTonAmount);
                break;
        }

        return payload;
    }

    private async generateCrossChainMessages(
        caller: string,
        evmData: Cell,
        aggregatedData: {
            jettons: JettonBridgingData[];
            crossChainTonAmount: number;
        },
    ): Promise<ShardMessage[]> {
        let crossChainTonAmount = aggregatedData.crossChainTonAmount;

        if (aggregatedData.jettons.length == 0) {
            return [
                {
                    address: this.TONParams.crossChainLayerAddress!,
                    value: Number((crossChainTonAmount + TRANSACTION_TON_AMOUNT).toFixed(9)),
                    payload: this.getTonTransferPayload(caller, evmData, crossChainTonAmount),
                },
            ];
        }

        const messages: ShardMessage[] = [];
        for (const jetton of aggregatedData.jettons) {
            const payload = await this.generatePayload(jetton, caller, evmData, crossChainTonAmount);
            const jettonWalletAddress = await this.getUserJettonWalletAddress(caller, jetton.address);
            await sleep(this.delay * 1000);

            messages.push({
                address: jettonWalletAddress,
                value: Number((crossChainTonAmount + TRANSACTION_TON_AMOUNT).toFixed(9)),
                payload,
            });

            crossChainTonAmount = 0;
        }

        return messages;
    }

    async sendCrossChainTransaction(
        evmProxyMsg: EvmProxyMsg,
        sender: SenderAbstraction,
        assets?: AssetBridgingData[],
    ): Promise<TransactionLinker> {
        if (!this.isInited) {
            await this.init();
        }
        const aggregatedData = this.aggregateJettons(assets);
        const transactionLinkerShardCount = aggregatedData.jettons.length == 0 ? 1 : aggregatedData.jettons.length;

        const caller = sender.getSenderAddress();
        const transactionLinker = generateTransactionLinker(caller, transactionLinkerShardCount);
        const evmData = buildEvmDataCell(transactionLinker, evmProxyMsg);

        const messages = await this.generateCrossChainMessages(caller, evmData, aggregatedData);
        const transaction: ShardTransaction = {
            validUntil: +new Date() + 15 * 60 * 1000,
            messages,
            network: this.network,
        };

        console.log('*****Sending transaction: ', transaction);
        const sendTransactionResult = await sender.sendShardTransaction(
            transaction,
            this.delay,
            this.network,
            this.TONParams.contractOpener,
        );
        return {sendTransactionResult, ...transactionLinker};
    }

    async getEVMTokenAddress(tvmTokenAddress: string): Promise<string> {
        if (!this.isInited) {
            await this.init();
        }

        if (tvmTokenAddress !== this.nativeTONAddress) {
            validateTVMAddress(tvmTokenAddress);

            const {code: givenMinterCodeBOC} = await this.TONParams.contractOpener!.getContractState(address(tvmTokenAddress));
            await sleep(this.delay * 1000);

            if (givenMinterCodeBOC && this.TONParams.jettonMinterCode!.equals(Cell.fromBoc(givenMinterCodeBOC)[0])) {
                const givenMinter = this.TONParams.contractOpener!.open(new JettonMaster(address(tvmTokenAddress)));
                const l2Address = await givenMinter.getL2Address();
                await sleep(this.delay * 1000);
                return l2Address;
            }
        }

        return calculateEVMTokenAddress(
            this.TACParams.abiCoder,
            await this.TACParams.crossChainLayer!.getAddress(),
            this.artifacts.tac.compilationArtifacts.CrossChainLayerToken.bytecode,
            this.artifacts.tac.addresses.TAC_SETTINGS_ADDRESS,
            tvmTokenAddress,
        );
    }

    async getTVMTokenAddress(evmTokenAddress: string): Promise<string> {
        if (!this.isInited) {
            await this.init();
        }

        validateEVMAddress(evmTokenAddress);

        const bytecode = await this.TACParams.provider.getCode(evmTokenAddress);

        if (bytecode.includes(ethers.id('getInfo()').slice(2, 10))) {
            const contract = new ethers.Contract(
                evmTokenAddress,
                this.artifacts.tac.compilationArtifacts.CrossChainLayerToken.abi,
                this.TACParams.provider,
            );
            const info = await contract.getInfo.staticCall();
            return info.l1Address;
        }

        const jettonMaster = JettonMaster.createFromConfig({
            evmTokenAddress,
            crossChainLayerAddress: address(this.TONParams.crossChainLayerAddress!),
            code: this.TONParams.jettonMinterCode!,
            walletCode: this.TONParams.jettonWalletCode!,
        });

        return jettonMaster.address.toString();
    }
}
