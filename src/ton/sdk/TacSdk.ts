import { Address, address, beginCell, Cell, toNano, TonClient } from '@ton/ton';
import { ethers } from 'ethers';

import CrossChainLayerToken from '../../abi/CrossChainLayerToken.json';
import ITokenUtils from '../../abi/ITokenUtils.json';
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
    CCL_L1_MSG_TO_L2_OP_CODE,
    JETTON_TRANSFER_FORWARD_TON_AMOUNT,
    MAINNET_TONCENTER_URL_ENDPOINT,
    TAC_RPC_ENDPOINT,
    TAC_SETTINGS_ADDRESS,
    TAC_TOKENUTILS_ADDRESS,
    TESTNET_TONCENTER_URL_ENDPOINT,
    TON_SETTINGS_ADDRESS,
    TON_TRANSFER_OP_TYPE,
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

const DEFAULT_DELAY = 3;

export class TacSdk {
    readonly network: Network;
    readonly delay: number;
    readonly settingsAddress: string;

    private isInited: boolean = false;

    private jettonProxyAddress!: string;
    private crossChainLayerAddress!: string;
    private jettonMinterCode!: Cell;
    private jettonWalletCode!: Cell;

    private contractOpener: ContractOpener;

    constructor(TacSDKParams: TacSDKTonClientParams) {
        this.network = TacSDKParams.network;
        this.delay = TacSDKParams.tonClientParameters ? (TacSDKParams.delay ?? 0) : DEFAULT_DELAY;

        this.settingsAddress = TacSDKParams.tonClientParameters
            ? (TacSDKParams.settingsAddress ?? TON_SETTINGS_ADDRESS)
            : TON_SETTINGS_ADDRESS;

        if (TacSDKParams.contractOpener) {
            this.contractOpener = TacSDKParams.contractOpener;
        } else {
            const tonClientParameters = TacSDKParams.tonClientParameters ?? {
                endpoint:
                    this.network == Network.Testnet ? TESTNET_TONCENTER_URL_ENDPOINT : MAINNET_TONCENTER_URL_ENDPOINT,
            };

            this.contractOpener = new TonClient(tonClientParameters);
        }
    }

    async init(): Promise<void> {
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
            .storeUint(CCL_L1_MSG_TO_L2_OP_CODE, 32)
            .storeUint(queryId, 64)
            .storeUint(TON_TRANSFER_OP_TYPE, 32)
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

    async getEVMTokenAddress(tvmTokenAddress: string): Promise<string> {
        if (!this.isInited) {
            await this.init();
        }

        validateTVMAddress(tvmTokenAddress);

        const { code: givenMinterCodeBOC } = await this.contractOpener.getContractState(address(tvmTokenAddress));
        if (givenMinterCodeBOC && this.jettonMinterCode.equals(Cell.fromBoc(givenMinterCodeBOC)[0])) {
            const givenMinter = this.contractOpener.open(new JettonMaster(address(tvmTokenAddress)));
            await sleep(this.delay * 1000);
            return await givenMinter.getL2Address();
        }

        const tokenUtilsContract = new ethers.Contract(
            TAC_TOKENUTILS_ADDRESS,
            ITokenUtils.abi,
            ethers.getDefaultProvider(TAC_RPC_ENDPOINT),
        );

        return await tokenUtilsContract.computeAddress(tvmTokenAddress, TAC_SETTINGS_ADDRESS);
    }

    async getTVMTokenAddress(evmTokenAddress: string): Promise<string> {
        if (!this.isInited) {
            await this.init();
        }

        validateEVMAddress(evmTokenAddress);

        const provider = ethers.getDefaultProvider(TAC_RPC_ENDPOINT);
        const bytecode = await provider.getCode(evmTokenAddress);

        if (bytecode.includes(ethers.id('getInfo()').slice(2, 10))) {
            const contract = new ethers.Contract(evmTokenAddress, CrossChainLayerToken.abi, provider);
            const info = await contract.getInfo.staticCall();
            return info.l1Address;
        }

        return JettonMaster.calculateAddress(
            evmTokenAddress,
            address(this.crossChainLayerAddress),
            this.jettonMinterCode,
            this.jettonWalletCode,
        );
    }
}
