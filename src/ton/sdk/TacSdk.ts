import {address, Address, beginCell, Cell, toNano, TonClient} from '@ton/ton';

// jetton imports
import {JettonMaster} from '../wrappers/JettonMaster';
import {JettonWallet} from '../wrappers/JettonWallet';

// ton settings
import {Settings} from '../wrappers/Settings';

// sender abstraction(tonconnect or mnemonic V3R2)
import type {SenderAbstraction} from '../sender_abstraction/SenderAbstraction';

// import structs
import {
    AssetOperationGeneralData,
    AssetOpType,
    EvmProxyMsg,
    JettonBurnData, JettonOperationGeneralData,
    JettonTransferData,
    Network,
    ShardMessage,
    ShardTransaction,
    TacSDKTonClientParams,
    TransactionLinker
} from '../structs/Struct';
import {ethers} from 'ethers';
import ITokenUtils from '../../abi/ITokenUtils.json';
import {
    buildEvmArgumentsCell,
    calculateContractAddress,
    generateQueryId, generateRandomNumberByTimestamp,
    generateTransactionLinker,
    sleep, validateTVMAddress
} from "./Utils";
import {
    CCL_L1_MSG_TO_L2_OP_CODE,
    MAINNET_TONCENTER_URL_ENDPOINT,
    TAC_RPC_ENDPOINT,
    TAC_SETTINGS_ADDRESS,
    TAC_TOKENUTILS_ADDRESS,
    TESTNET_TONCENTER_URL_ENDPOINT,
    TON_SETTINGS_ADDRESS,
    TON_TRANSFER_OP_TYPE, TRANSACTION_TON_AMOUNT
} from "./Consts";


const DEFAULT_DELAY = 3;

export class TacSdk {
    readonly tonClient: TonClient;
    readonly network: Network;
    readonly delay: number;
    readonly settingsAddress: string;

    private isInited: boolean = false;

    private jettonProxyAddress!: string;
    private crossChainLayerAddress!: string;
    private jettonMinterCode!: Cell;
    private jettonWalletCode!: Cell;

    constructor(TacSDKParams: TacSDKTonClientParams) {
        this.network = TacSDKParams.network;
        this.delay = TacSDKParams.tonClientParameters
            ? TacSDKParams.delay ?? 0
            : DEFAULT_DELAY;

        this.settingsAddress = TacSDKParams.tonClientParameters
            ? TacSDKParams.settingsAddress ?? TON_SETTINGS_ADDRESS
            : TON_SETTINGS_ADDRESS;

        const tonClientParameters = TacSDKParams.tonClientParameters ?? {
            endpoint: this.network == Network.Testnet ? TESTNET_TONCENTER_URL_ENDPOINT : MAINNET_TONCENTER_URL_ENDPOINT
        };
        this.tonClient = new TonClient(tonClientParameters);
    }

    async init(): Promise<void> {
        const settings = this.tonClient.open(new Settings(Address.parse(this.settingsAddress)));

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
        const jettonMaster = this.tonClient.open(new JettonMaster(Address.parse(tokenAddress)));
        return await jettonMaster.getWalletAddress(userAddress);
    };

    async getUserJettonBalance(userAddress: string, tokenAddress: string): Promise<number> {
        const jettonMaster = this.tonClient.open(new JettonMaster(Address.parse(tokenAddress)));
        const userJettonWalletAddress = await jettonMaster.getWalletAddress(userAddress);
        await sleep(this.delay * 1000);

        const userJettonWallet = this.tonClient.open(new JettonWallet(Address.parse(userJettonWalletAddress)));
        return await userJettonWallet.getJettonBalance();
    };

    private getJettonTransferPayload(jettonData: JettonTransferData, responseAddress: string, l2Data: Cell, crossChainTonAmount?: number): Cell {
        const queryId = generateRandomNumberByTimestamp().randomNumber;
        const forwardAmount = 0.2;
        return JettonWallet.transferMessage(jettonData.amount, this.jettonProxyAddress, responseAddress, forwardAmount, crossChainTonAmount, l2Data, queryId);
    };

    private getJettonBurnPayload(jettonData: JettonBurnData, l2Data: Cell, crossChainTonAmount?: number): Cell {
        const queryId = generateRandomNumberByTimestamp().randomNumber;
        return JettonWallet.burnMessage(jettonData.amount, jettonData.notificationReceiverAddress, crossChainTonAmount, l2Data, queryId);
    }

    private getTonTransferPayload(responseAddress: string, l2Data: Cell, crossChainTonAmount?: number): Cell {
        const queryId = generateRandomNumberByTimestamp().randomNumber;
        return beginCell()
            .storeUint(CCL_L1_MSG_TO_L2_OP_CODE, 32)
            .storeUint(queryId, 64)
            .storeUint(TON_TRANSFER_OP_TYPE, 32)
            .storeCoins(toNano(crossChainTonAmount?.toFixed(9) ?? 0))
            .storeAddress(Address.parse(responseAddress))
            .storeMaybeRef(l2Data)
            .endCell()
    }

    private async detectJettonOpType(asset: JettonOperationGeneralData): Promise<AssetOpType> {
        const {code: givenMinterCodeBOC} = await this.tonClient.getContractState(address(asset.address));
        if (!givenMinterCodeBOC) {
            throw new Error('unexpected empty contract code of given jetton.');
        }
        const givenMinterCode = Cell.fromBoc(givenMinterCodeBOC)[0];
        await sleep(this.delay * 1000);

        if (!this.jettonMinterCode.equals(givenMinterCode)) {
            return AssetOpType.JettonTransfer;
        }

        const givenMinter = this.tonClient.open(new JettonMaster(address(asset.address)));
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
                .endCell()
        );

        if (!expectedMinterAddress.equals(givenMinter.address)) {
            return AssetOpType.JettonTransfer;
        }

        return AssetOpType.JettonBurn;
    }

    private prepareJettons(assets?: AssetOperationGeneralData[]): {
        jettons: JettonOperationGeneralData[],
        crossChainTonAmount: number,
    } {
        const uniqueAssetsMap: Map<string, number> = new Map();
        let crossChainTonAmount = 0;

        assets?.forEach(asset => {
            if (asset.amount <= 0) return;

            if (asset.address) {
                validateTVMAddress(asset.address);
                uniqueAssetsMap.set(asset.address, (uniqueAssetsMap.get(asset.address) || 0) + asset.amount);
            } else {
                crossChainTonAmount += asset.amount;
            }
        });

        const jettons: JettonOperationGeneralData[] = Array.from(uniqueAssetsMap.entries()).map(([address, amount]) => ({
            address,
            amount
        }));

        return {
            jettons,
            crossChainTonAmount
        };
    }

    private async prepareMessages(caller: string, l2Data: Cell, assets?: AssetOperationGeneralData[]): Promise<ShardMessage[]> {
        const preparedData = this.prepareJettons(assets);
        let crossChainTonAmount = preparedData.crossChainTonAmount;

        if ((preparedData.jettons.length == 0)){
            return [{
                address: this.crossChainLayerAddress,
                value: Number((crossChainTonAmount + TRANSACTION_TON_AMOUNT).toFixed(9)),
                payload: this.getTonTransferPayload(caller, l2Data, crossChainTonAmount)
            }]
        }

        let messages: ShardMessage[] = [];
        for (const jetton of preparedData.jettons) {
            const opType = await this.detectJettonOpType(jetton);
            console.log(`***** Jetton ${jetton.amount} requires ${opType} operation`);

            let payload: Cell;
            switch (opType) {
                case AssetOpType.JettonBurn:
                    payload = this.getJettonBurnPayload({notificationReceiverAddress: this.crossChainLayerAddress, ...jetton}, l2Data, crossChainTonAmount);
                    break;
                case AssetOpType.JettonTransfer:
                    payload = this.getJettonTransferPayload(jetton, caller, l2Data, crossChainTonAmount);
                    break;
            }

            const jettonWalletAddress = await this.getUserJettonWalletAddress(caller, jetton.address);
            await sleep(this.delay * 1000);

            messages.push({
                address: jettonWalletAddress,
                value: Number((crossChainTonAmount + TRANSACTION_TON_AMOUNT).toFixed(9)),
                payload
            });

            crossChainTonAmount = 0;
        }

        return messages;
    }

    async sendCrossChainTransaction(evmProxyMsg: EvmProxyMsg, sender: SenderAbstraction, assets?: AssetOperationGeneralData[]): Promise<TransactionLinker> {
        if (!this.isInited) {
            throw new Error('TacSdk not initialized. Call init() first.');
        }
        const caller = await sender.getSenderAddress();
        const transactionLinker = generateTransactionLinker(caller, assets?.length ?? 1)
        const l2Data = buildEvmArgumentsCell(transactionLinker, evmProxyMsg);

        const messages = await this.prepareMessages(caller, l2Data, assets);
        const transaction: ShardTransaction = {
            validUntil: +new Date() + 15 * 60 * 1000,
            messages,
            network: this.network
        };

        console.log('*****Sending transaction: ', transaction);
        await sender.sendShardTransaction(transaction, this.delay, this.network, this.tonClient);
        return transactionLinker;
    }

    async calculateEVMTokenAddress(tvmTokenAddress: string): Promise<string> {
        if (!this.isInited) {
            throw new Error('TacSdk not initialized. Call init() first.');
        }

        validateTVMAddress(tvmTokenAddress);

        const {code: givenMinterCodeBOC} = await this.tonClient.getContractState(address(tvmTokenAddress));
        if (givenMinterCodeBOC && this.jettonMinterCode.equals(Cell.fromBoc(givenMinterCodeBOC)[0])) {
            const givenMinter = this.tonClient.open(new JettonMaster(address(tvmTokenAddress)));
            await sleep(this.delay * 1000);
            return await givenMinter.getL2Address();
        }

        const tokenUtilsContract = new ethers.Contract(
            TAC_TOKENUTILS_ADDRESS,
            ITokenUtils.abi,
            ethers.getDefaultProvider(TAC_RPC_ENDPOINT)
        );

        return await tokenUtilsContract.computeAddress(
            tvmTokenAddress,
            TAC_SETTINGS_ADDRESS
        );
    }
}
