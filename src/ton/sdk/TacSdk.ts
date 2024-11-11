import {Address, beginCell, Cell, toNano, TonClient, TonClientParameters} from "@ton/ton";
import {Base64} from '@tonconnect/protocol';
import axios from 'axios';

// jetton imports
import {JettonMaster} from "../jetton/JettonMaster";
import {JettonWallet} from "../jetton/JettonWallet";

// ton settings 
import { Settings } from "../settings/Settings";

// sender abstraction(tonconnect or mnemonic V3R2)
import { SenderAbstraction } from "../sender_abstaction/SenderAbstraction"

// import structs
import { TacSDKTonClientParams, TransactionLinker, JettonTransferData, EvmProxyMsg, TransferMessage, ShardTransaction } from "../structs/Struct"

const TESTNET_TONCENTER_URL_ENDPOINT = "https://testnet.toncenter.com/api/v2"
const MAINNET_TONCENTER_URL_ENDPOINT = "https://toncenter.com/api/v2"
const TON_SETTINGS_ADDRESS = "EQA4-dfeqBq6Rkf096Cbrdf9EC0Mtio-QdpM0nRnf_CBUcMH"
const PUBLIC_LITE_SEQUENCER_IPs = ["localhost"]
const PUBLIC_LITE_SEQUENCER_PORTs = ["8080"]

export class TacSdk {

    readonly tonClient: TonClient;
    readonly network: number;

    constructor(tonClientParams: TacSDKTonClientParams) {
        this.network = tonClientParams.network ?? 1;
        const tonClientParameters = tonClientParams.tonClientParameters ?? {
            endpoint: tonClientParams.network == 0 ? TESTNET_TONCENTER_URL_ENDPOINT : MAINNET_TONCENTER_URL_ENDPOINT
        };
        this.tonClient = new TonClient(tonClientParameters);
    }

    async getJettonProxyAddress(): Promise<string> {
        const settings = this.tonClient.open(new Settings(Address.parse(TON_SETTINGS_ADDRESS)));
        return await settings.getAddressSetting("JettonProxyAddress");
    }

    async getUserJettonWalletAddress(userAddress: string, tokenAddress: string): Promise<string>{
        const jettonMaster = this.tonClient.open(new JettonMaster(Address.parse(tokenAddress)));
        return await jettonMaster.getWalletAddress(userAddress);
    };

    async getUserJettonBalance(userAddress: string, tokenAddress: string): Promise<number> {
        const jettonMaster = this.tonClient.open(new JettonMaster(Address.parse(tokenAddress)));
        const userJettonWalletAddress = await jettonMaster.getWalletAddress(userAddress);
        const userJettonWallet = this.tonClient.open(new JettonWallet(Address.parse(userJettonWalletAddress)))
        return await userJettonWallet.getJettonBalance();
    };

    private getTVMPayload(transactionLinker : TransactionLinker, jettonProxyAddress: string, jettonData: JettonTransferData, evmProxyMsg: EvmProxyMsg): string {
        const evmArguments = Buffer.from(evmProxyMsg.encodedParameters.split('0x')[1], 'hex').toString('base64');

        const json = JSON.stringify({
            evm_call: {
                target: evmProxyMsg.evmTargetAddress,
                method_name: evmProxyMsg.methodName,
                arguments: evmArguments,
            },  
            sharded_id: transactionLinker.sharded_id,
            shard_count: transactionLinker.shard_count,
        });

        const l2Data = beginCell().storeStringTail(json).endCell();
        const forwardAmount = '0.2';

        const payload = beginCell().
            storeUint(0xF8A7EA5, 32).
            storeUint(transactionLinker.query_id, 64).
            storeCoins(toNano(jettonData.jettonAmount.toFixed(9))).
            storeAddress(Address.parse(jettonProxyAddress)).
            storeAddress(Address.parse(jettonData.fromAddress)).
            storeBit(false).
            storeCoins(toNano(forwardAmount)).
            storeMaybeRef(l2Data).
            endCell();

        return Base64.encode(payload).toString();
    };

    async sendTransaction(jettons: JettonTransferData[], evmProxyMsg: EvmProxyMsg, sender: SenderAbstraction): Promise<{transactionLinker: TransactionLinker}> {
        const timestamp = Math.floor(+new Date() / 1000);
        const randAppend = Math.round(Math.random()*1000);
        const query_id = timestamp + randAppend;
        const sharded_id = String(timestamp + Math.round(Math.random()*1000));
        const jettonProxyAddress = await this.getJettonProxyAddress();

        const transactionLinker : TransactionLinker = {
            caller: jettons[0].fromAddress,
            query_id,
            shard_count: jettons.length,
            sharded_id,
            timestamp: timestamp,
        }

        const messages : TransferMessage[] = [];

        for (const jetton of jettons) {
            const jettonAddress = await this.getUserJettonWalletAddress(jetton.fromAddress, jetton.tokenAddress);
            const payload = this.getTVMPayload(
                transactionLinker,
                jettonProxyAddress,
                jetton,
                evmProxyMsg,
            );
    
            messages.push({
                address: jettonAddress,
                value: toNano(jetton.tonAmount?.toFixed(9) ?? "0.35").toString(),
                payload: payload,
            });
        }
    
        const transaction: ShardTransaction = {
            validUntil: +new Date() + 15 * 60 * 1000,
            messages: messages,
            network: this.network
        };

        console.log('*****Sending transaction: ', transaction);
        const boc = await sender.sendTransaction(transaction, this.network, this.tonClient);
        return { 
            transactionLinker,
        };
    };

    async getOperationId(queryId: string, caller: string, timestamp: number) {
        const lite_sequencer_ip = PUBLIC_LITE_SEQUENCER_IPs[0]; 
        const lite_sequencer_port = PUBLIC_LITE_SEQUENCER_PORTs[0];
        try {
            const response = await axios.get(`http://${lite_sequencer_ip}:${lite_sequencer_port}/operationId`, {
                params: { queryId, caller, timestamp, shardCount: 1 }
            });
            return response.data.response || "";
        } catch (error) {
            console.error("Error fetching operation ID:", error);
            throw new Error("Failed to fetch operation ID");
        }
    }

    async getStatusTransaction(operationId: string) {
        const lite_sequencer_ip = PUBLIC_LITE_SEQUENCER_IPs[0]; 
        const lite_sequencer_port = PUBLIC_LITE_SEQUENCER_PORTs[0];

        try {
            const response = await axios.get(`http://${lite_sequencer_ip}:${lite_sequencer_port}/status`, {
                params: { operationId }
            });
            return response.data.response || "";
        } catch (error) {
            console.error("Error fetching operation ID:", error);
            throw new Error("Failed to fetch operation ID");
        }
    }
}
