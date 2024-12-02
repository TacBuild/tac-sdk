import {address, Address, beginCell, Cell, TonClient} from '@ton/ton';

// jetton imports
import {JettonMaster} from '../wrappers/JettonMaster';
import {JettonWallet} from '../wrappers/JettonWallet';

// ton settings
import {Settings} from '../wrappers/Settings';

// sender abstraction(tonconnect or mnemonic V3R2)
import type {SenderAbstraction} from '../sender_abstraction/SenderAbstraction';

// import structs
import type {
    TacSDKTonClientParams,
    TransactionLinker,
    JettonTransferData,
    EvmProxyMsg,
    ShardMessage,
    ShardTransaction,
    JettonBurnData,
    JettonOperationGeneralData
} from '../structs/Struct';
import {Network, JettonOpType} from '../structs/Struct';
import {ethers} from 'ethers';
import ITokenUtils from '../../abi/ITokenUtils.json';
import {buildEvmArgumentsCell, calculateContractAddress, generateQueryId, sleep} from "./Utils";
import {
    MAINNET_TONCENTER_URL_ENDPOINT, TAC_RPC_ENDPOINT, TAC_SETTINGS_ADDRESS,
    TAC_TOKENUTILS_ADDRESS,
    TESTNET_TONCENTER_URL_ENDPOINT,
    TON_SETTINGS_ADDRESS
} from "./Consts";


const DEFAULT_DELAY = 3;

export class TacSdk {
    readonly tonClient: TonClient;
    readonly network: Network;
    readonly delay: number;

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

        const tonClientParameters = TacSDKParams.tonClientParameters ?? {
            endpoint: this.network == Network.Testnet ? TESTNET_TONCENTER_URL_ENDPOINT : MAINNET_TONCENTER_URL_ENDPOINT
        };
        this.tonClient = new TonClient(tonClientParameters);
    }

    async init(): Promise<void> {
        const settings = this.tonClient.open(new Settings(Address.parse(TON_SETTINGS_ADDRESS)));

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

    private getJettonTransferPayload(jettonData: JettonTransferData, l2Data: Cell): Cell {
        const queryId = generateQueryId();
        const forwardAmount = 0.2;
        return JettonWallet.transferMessage(jettonData.jettonAmount, this.jettonProxyAddress, jettonData.fromAddress, forwardAmount, jettonData.tonAmount, l2Data, queryId);
    };

    private getJettonBurnPayload(jettonData: JettonBurnData, l2Data: Cell): Cell {
        const queryId = generateQueryId();
        return JettonWallet.burnMessage(jettonData.jettonAmount, jettonData.notificationReceiverAddress, jettonData.tonAmount, l2Data, queryId);
    }

    private getTonTransferPayload(l2Data: Cell, tonAmount?: number): Cell {
        const queryId = generateQueryId();
        return beginCell()
            .storeUint(0x6c582059, 32)
            .storeUint(queryId, 64)
            .storeUint(0x4ad67cd3, 32)
            .storeCoins(tonAmount ?? 0)
            .storeAddress(null)
            .storeMaybeRef(l2Data)
            .endCell()
    }

    private async detectOpType(jetton: JettonOperationGeneralData): Promise<JettonOpType> {
        const {code: givenMinterCodeBOC} = await this.tonClient.getContractState(address(jetton.tokenAddress));
        if (!givenMinterCodeBOC) {
            throw new Error('unexpected empty contract code of given jetton.');
        }
        const givenMinterCode = Cell.fromBoc(givenMinterCodeBOC)[0];
        await sleep(this.delay * 1000);

        if (!this.jettonMinterCode.equals(givenMinterCode)) {
            return JettonOpType.Transfer;
        }

        const givenMinter = this.tonClient.open(new JettonMaster(address(jetton.tokenAddress)));
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
            return JettonOpType.Transfer;
        }

        return JettonOpType.Burn;
    }

    async sendCrossChainJettonTransaction(jettons: JettonOperationGeneralData[], evmProxyMsg: EvmProxyMsg, sender: SenderAbstraction): Promise<TransactionLinker> {
        if (!this.isInited) {
            throw new Error('TacSdk not initialized. Call init() first.');
        }

        const timestamp = Math.floor(+new Date() / 1000);
        const shardedId = String(timestamp + Math.round(Math.random() * 1000));

        const transactionLinker: TransactionLinker = {
            caller: Address.normalize(jettons[0].fromAddress),
            shardCount: jettons.length,
            shardedId,
            timestamp
        };

        const messages: ShardMessage[] = [];

        const l2Data = buildEvmArgumentsCell(transactionLinker, evmProxyMsg);

        for (const jetton of jettons) {

            const opType = await this.detectOpType(jetton);
            console.log(`***** Jetton ${jetton.tokenAddress} requires ${opType} operation`);

            let payload: Cell
            switch (opType) {
                case JettonOpType.Burn:
                    payload = this.getJettonBurnPayload({notificationReceiverAddress: this.crossChainLayerAddress, ...jetton}, l2Data);
                    break;
                case JettonOpType.Transfer:
                    payload = this.getJettonTransferPayload(jetton, l2Data);
                    break;
            }

            const jettonWalletAddress = await this.getUserJettonWalletAddress(jetton.fromAddress, jetton.tokenAddress);
            await sleep(this.delay * 1000);

            messages.push({
                address: jettonWalletAddress,
                value: Number(((jetton.tonAmount || 0) + 0.35).toFixed(9)),
                payload
            });
        }

        const transaction: ShardTransaction = {
            validUntil: +new Date() + 15 * 60 * 1000,
            messages,
            network: this.network
        };

        console.log('*****Sending transaction: ', transaction);
        const boc = await sender.sendShardTransaction(transaction, this.delay, this.network, this.tonClient);
        return transactionLinker;
    }

    async calculateEVMTokenAddress(tvmTokenAddress: string): Promise<string> {
        const tokenUtilsContract = new ethers.Contract(TAC_TOKENUTILS_ADDRESS, ITokenUtils.abi, ethers.getDefaultProvider(TAC_RPC_ENDPOINT));

        const tokenL2Address = await tokenUtilsContract.computeAddress(
            tvmTokenAddress,
            TAC_SETTINGS_ADDRESS,
        );

        return tokenL2Address;
    }
}
