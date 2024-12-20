import { Address, address, beginCell, Cell, toNano, TonClient } from '@ton/ton';
import { ethers, keccak256, toUtf8Bytes } from 'ethers';

import type { SenderAbstraction } from '../sender/SenderAbstraction';
// import structs
import {
    AssetBridgingData,
    AssetOpType,
    ContractOpener,
    EvmProxyMsg,
    JettonBridgingData,
    JettonBurnData,
    JettonTransferData,
    Network,
    ShardMessage,
    ShardTransaction,
    TacSDKTonClientParams,
    TransactionLinker,
} from '../structs/Struct';
// jetton imports
import { JettonMaster } from '../wrappers/JettonMaster';
import { JettonWallet } from '../wrappers/JettonWallet';
// ton settings
import { Settings } from '../wrappers/Settings';
import {
    JETTON_TRANSFER_FORWARD_TON_AMOUNT,
    MAINNET_TONCENTER_URL_ENDPOINT,
    NATIVE_TAC_ADDRESS,
    NATIVE_TON_ADDRESS,
    TAC_RPC_ENDPOINT,
    TESTNET_TONCENTER_URL_ENDPOINT,
    TRANSACTION_TON_AMOUNT,
} from './Consts';
import {
    buildEvmDataCell,
    calculateContractAddress,
    generateRandomNumberByTimestamp,
    generateTransactionLinker,
    sleep,
    validateEVMAddress,
    validateTVMAddress,
} from './Utils';
import { testnet, mainnet } from '@tonappchain/artifacts';

const DEFAULT_DELAY = 3;

export class TacSdk {
    readonly network: Network;
    readonly delay: number;
    readonly artifacts;
    readonly settingsAddress: string;

    private isInited: boolean = false;

    private jettonProxyAddress!: string;
    private crossChainLayerAddress!: string;
    private jettonMinterCode!: Cell;
    private jettonWalletCode!: Cell;

    private contractOpener: ContractOpener;
    private TACProvider: ethers.AbstractProvider;
    private TACSettings: ethers.Contract;
    private TACTokenUtils!: ethers.Contract;

    constructor(TacSDKParams: TacSDKTonClientParams) {
        this.network = TacSDKParams.network;
        this.artifacts = this.network === Network.Testnet ? testnet : mainnet;
        this.delay = TacSDKParams.tonClientParameters ? (TacSDKParams.delay ?? 0) : DEFAULT_DELAY;

        this.settingsAddress = TacSDKParams.tonClientParameters
            ? (TacSDKParams.settingsAddress ?? this.artifacts.ton.addresses.TON_SETTINGS_ADDRESS)
            : this.artifacts.ton.addresses.TON_SETTINGS_ADDRESS;

        if (TacSDKParams.contractOpener) {
            this.contractOpener = TacSDKParams.contractOpener;
        } else {
            const tonClientParameters = TacSDKParams.tonClientParameters ?? {
                endpoint:
                    this.network == Network.Testnet ? TESTNET_TONCENTER_URL_ENDPOINT : MAINNET_TONCENTER_URL_ENDPOINT,
            };

            this.contractOpener = new TonClient(tonClientParameters);
        }

        this.TACProvider = ethers.getDefaultProvider(TAC_RPC_ENDPOINT);
        this.TACSettings = new ethers.Contract(
            this.artifacts.tac.addresses.TAC_SETTINGS_ADDRESS,
            this.artifacts.tac.abi.Settings.abi,
            this.TACProvider,
        );
    }

    async init(): Promise<void> {
        const tokenUtilsAddress: string = await this.TACSettings.getAddressSetting(
            keccak256(toUtf8Bytes('TokenUtilsAddress')),
        );
        this.TACTokenUtils = new ethers.Contract(
            tokenUtilsAddress,
            this.artifacts.tac.abi.ITokenUtils.abi,
            this.TACProvider,
        );

        const settings = this.contractOpener.open(new Settings(Address.parse(this.settingsAddress)));

        this.jettonProxyAddress = await settings.getAddressSetting('JettonProxyAddress');
        await sleep(this.delay * 1000);

        this.crossChainLayerAddress = await settings.getAddressSetting('CrossChainLayerAddress');
        await sleep(this.delay * 1000);

        this.jettonMinterCode = await settings.getCellSetting('JETTON_MINTER_CODE');
        await sleep(this.delay * 1000);

        this.jettonWalletCode = await settings.getCellSetting('JETTON_WALLET_CODE');
        await sleep(this.delay * 1000);

        this.isInited = true;
    }

    async getUserJettonWalletAddress(userAddress: string, tokenAddress: string): Promise<string> {
        const jettonMaster = this.contractOpener.open(new JettonMaster(Address.parse(tokenAddress)));
        return await jettonMaster.getWalletAddress(userAddress);
    }

    async getUserJettonBalance(userAddress: string, tokenAddress: string): Promise<number> {
        const jettonMaster = this.contractOpener.open(new JettonMaster(Address.parse(tokenAddress)));
        const userJettonWalletAddress = await jettonMaster.getWalletAddress(userAddress);
        await sleep(this.delay * 1000);

        const userJettonWallet = this.contractOpener.open(new JettonWallet(Address.parse(userJettonWalletAddress)));
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
            this.jettonProxyAddress,
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
        const { code: givenMinterCodeBOC } = await this.contractOpener.getContractState(address(asset.address));
        if (!givenMinterCodeBOC) {
            throw new Error('unexpected empty contract code of given jetton.');
        }
        const givenMinterCode = Cell.fromBoc(givenMinterCodeBOC)[0];
        await sleep(this.delay * 1000);

        if (!this.jettonMinterCode.equals(givenMinterCode)) {
            return AssetOpType.JettonTransfer;
        }

        const givenMinter = this.contractOpener.open(new JettonMaster(address(asset.address)));
        const l2Address = await givenMinter.getL2Address();
        await sleep(this.delay * 1000);

        const expectedMinterAddress = await calculateContractAddress(
            this.jettonMinterCode,
            beginCell()
                .storeCoins(0)
                .storeAddress(address(this.crossChainLayerAddress))
                .storeRef(beginCell().endCell())
                .storeRef(this.jettonWalletCode)
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
                        notificationReceiverAddress: this.crossChainLayerAddress,
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
        assets?: AssetBridgingData[],
    ): Promise<ShardMessage[]> {
        const aggregatedData = this.aggregateJettons(assets);
        let crossChainTonAmount = aggregatedData.crossChainTonAmount;

        if (aggregatedData.jettons.length == 0) {
            return [
                {
                    address: this.crossChainLayerAddress,
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
        const caller = sender.getSenderAddress();
        const transactionLinker = generateTransactionLinker(caller, assets?.length ?? 1);
        const evmData = buildEvmDataCell(transactionLinker, evmProxyMsg);

        const messages = await this.generateCrossChainMessages(caller, evmData, assets);
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
            this.contractOpener,
        );
        return { sendTransactionResult, ...transactionLinker };
    }

    async getEVMTokenAddress(tvmTokenAddress: string | typeof NATIVE_TON_ADDRESS): Promise<string> {
        if (!this.isInited) {
            await this.init();
        }

        if (tvmTokenAddress !== NATIVE_TON_ADDRESS) {
            validateTVMAddress(tvmTokenAddress);

            const { code: givenMinterCodeBOC } = await this.contractOpener.getContractState(address(tvmTokenAddress));
            if (givenMinterCodeBOC && this.jettonMinterCode.equals(Cell.fromBoc(givenMinterCodeBOC)[0])) {
                const givenMinter = this.contractOpener.open(new JettonMaster(address(tvmTokenAddress)));
                await sleep(this.delay * 1000);
                return await givenMinter.getL2Address();
            }
        }

        return await this.TACTokenUtils.computeAddress(
            tvmTokenAddress,
            this.artifacts.tac.addresses.TAC_SETTINGS_ADDRESS,
        );
    }

    async getTVMTokenAddress(evmTokenAddress: string | typeof NATIVE_TAC_ADDRESS): Promise<string> {
        if (!this.isInited) {
            await this.init();
        }

        validateEVMAddress(evmTokenAddress);

        const bytecode = await this.TACProvider.getCode(evmTokenAddress);

        if (bytecode.includes(ethers.id('getInfo()').slice(2, 10))) {
            const contract = new ethers.Contract(
                evmTokenAddress,
                this.artifacts.tac.abi.CrossChainLayerToken.abi,
                this.TACProvider,
            );
            const info = await contract.getInfo.staticCall();
            return info.l1Address;
        }

        const jettonMaster = JettonMaster.createFromConfig({
            evmTokenAddress,
            crossChainLayerAddress: address(this.crossChainLayerAddress),
            code: this.jettonMinterCode,
            walletCode: this.jettonWalletCode,
        });

        return jettonMaster.address.toString();
    }
}
