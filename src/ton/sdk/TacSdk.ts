import {Address, beginCell, toNano, TonClient, TonClientParameters} from "@ton/ton";
import {Base64} from '@tonconnect/protocol';
import {CHAIN, SendTransactionRequest, TonConnectUI} from "@tonconnect/ui";
import {JettonMaster} from "../jetton/JettonMaster";
import {JettonWallet} from "../jetton/JettonWallet";
import axios from 'axios';

const TESTNET_TONCENTER_URL_ENDPOINT = "https://testnet.toncenter.com/api/v2"
const MAINNET_TONCENTER_URL_ENDPOINT = "https://toncenter.com/api/v2"
const MAINNET_TAC_JETTON_PROXY_ADDRESS = "EQAqOlIzUWuVhXDmHQyt-Ek3FnR6kH_EM0dJB_kdUp2JRmd9"
const TESTNET_TAC_JETTON_PROXY_ADDRESS = "EQBcB0XZEv-T_9tYnbJc-DoYqAFz71k5KUkZTLX1etwfuMIB"

export type TacSdkParameters = {
    /**
     * TonClient Parameters
     */
    tonClientParameters?: TonClientParameters;

    /**
     * TON CHAIN
     */
    network?: CHAIN;
}

export type JettonProxyMsgParameters = {
    tonConnect: TonConnectUI,
    fromAddress: string,
    tokenAddress: string,
    jettonAmount: number,
    proxyMsg: EvmProxyMsg,
    tonAmount?: number
}

export type EvmProxyMsg = {
    evmTargetAddress: string,
    methodName: string
    encodedParameters: string,
}

export class TacSdk {

    readonly tonClient: TonClient;
    readonly network: CHAIN;

    constructor(parameters: TacSdkParameters) {
        this.network = parameters.network ?? CHAIN.MAINNET;
        const tonClientParameters = parameters.tonClientParameters ?? {
            endpoint: parameters.network == CHAIN.TESTNET ? TESTNET_TONCENTER_URL_ENDPOINT : MAINNET_TONCENTER_URL_ENDPOINT
        };
        this.tonClient = new TonClient(tonClientParameters);
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

    private getJettonBase64Payload(jettonAmount: number, tonFromAddress: string, proxyMsg: EvmProxyMsg): {payload: string; query_id: number, timestamp: number} {
        const timestamp = Math.floor(+new Date() / 1000);
        const base64Parameters = Buffer.from(proxyMsg.encodedParameters.split('0x')[1], 'hex').toString('base64');
        const randAppend = Math.round(Math.random()*1000);
        const query_id = timestamp + randAppend;
        const json = JSON.stringify({
            query_id: query_id,
            target: proxyMsg.evmTargetAddress,
            methodName: proxyMsg.methodName,
            arguments: base64Parameters,
            caller: Address.parse(tonFromAddress).toString(),
        });

        const l2Data = beginCell().storeStringTail(json).endCell();
        const forwardAmount = '0.2';

        const payload = beginCell()
            .storeUint(0xF8A7EA5, 32)
            .storeUint(query_id, 64)
            .storeCoins(toNano(jettonAmount.toFixed(9)))
            .storeAddress(Address.parse(this.network == CHAIN.TESTNET ? TESTNET_TAC_JETTON_PROXY_ADDRESS : MAINNET_TAC_JETTON_PROXY_ADDRESS))
            .storeAddress(Address.parse(tonFromAddress))
            .storeBit(false)
            .storeCoins(toNano(forwardAmount))
            .storeMaybeRef(l2Data).endCell();

        return {
            payload: Base64.encode(payload.toBoc()).toString(), 
            query_id: query_id, 
            timestamp: timestamp
        };
    };
        
    async sendJettonWithProxyMsg(params: JettonProxyMsgParameters): Promise<{caller: string; query_id: number, timestamp: number}> {
        if (params.tonAmount && params.tonAmount <= 0.2){
            throw Error("Amount of TON cannot be less than 0.2")
        }

        const jettonAddress = await this.getUserJettonWalletAddress(params.fromAddress, params.tokenAddress);
        const {payload, query_id, timestamp} = this.getJettonBase64Payload(params.jettonAmount, params.fromAddress, params.proxyMsg)
        const transaction: SendTransactionRequest = {
            validUntil: +new Date() + 15 * 60 * 1000,
            messages: [
                {
                    address: jettonAddress,
                    amount: toNano(params.tonAmount?.toFixed(9) ?? "0.35").toString(),
                    payload: payload
                }
            ],
            network: this.network
        };

        console.log('*****Sending transaction: ', transaction);
        const boc = await params.tonConnect.sendTransaction(transaction);
        return {
            caller: params.fromAddress, 
            query_id: query_id, 
            timestamp: timestamp
        };
    };

    async getOperationId(queryId: string, caller: string, timestamp: number) {
        try {
            const response = await axios.get(`http://localhost:8080/operationId`, {
                params: { queryId, caller, timestamp }
            });
            return response.data.response || "";
        } catch (error) {
            console.error("Error fetching operation ID:", error);
            throw new Error("Failed to fetch operation ID");
        }
    }

    async getStatusTransaction(operationId: string) {
        try {
            const response = await axios.get(`http://localhost:8080/status`, {
                params: { operationId }
            });
            return response.data.response || "";
        } catch (error) {
            console.error("Error fetching operation ID:", error);
            throw new Error("Failed to fetch operation ID");
        }
    }
}
