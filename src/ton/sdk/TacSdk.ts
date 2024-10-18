import {Address, beginCell, toNano, TonClient, TonClientParameters} from "@ton/ton";
import {Base64} from '@tonconnect/protocol';
import {CHAIN, SendTransactionRequest, TonConnectUI} from "@tonconnect/ui";
import {JettonMaster} from "../jetton/JettonMaster";
import {JettonWallet} from "../jetton/JettonWallet";

const TESTNET_TONCENTER_URL_ENDPOINT = "https://testnet.toncenter.com/api/v2"
const MAINNET_TONCENTER_URL_ENDPOINT = "https://toncenter.com/api/v2"
const TESTNET_TAC_JETTON_PROXY_ADDRESS = "EQBcB0XZEv-T_9tYnbJc-DoYqAFz71k5KUkZTLX1etwfuMIB"
const MAINNET_TAC_JETTON_PROXY_ADDRESS = "EQAqOlIzUWuVhXDmHQyt-Ek3FnR6kH_EM0dJB_kdUp2JRmd9"


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

    private getJettonBase64Payload(jettonAmount: number, tonFromAddress: string, proxyMsg: EvmProxyMsg): string {
        const timestamp = Math.floor(+new Date() / 1000);
        const base64Parameters = Buffer.from(proxyMsg.encodedParameters.split('0x')[1], 'hex').toString('base64');
        const randAppend = Math.round(Math.random()*1000);

        const json = JSON.stringify({
            query_id: timestamp + randAppend,
            target: proxyMsg.evmTargetAddress,
            methodName: proxyMsg.methodName,
            arguments: base64Parameters,
            caller: Address.parse(tonFromAddress).toString(),
        });

        const l2Data = beginCell().storeStringTail(json).endCell();
        const forwardAmount = '0.2';

        const payload = beginCell()
            .storeUint(0xF8A7EA5, 32)
            .storeUint(0, 64) // timestamp + randAppend
            .storeCoins(toNano(jettonAmount.toFixed(9)))
            .storeAddress(Address.parse(this.network == CHAIN.TESTNET ? TESTNET_TAC_JETTON_PROXY_ADDRESS : MAINNET_TAC_JETTON_PROXY_ADDRESS))
            .storeAddress(Address.parse(tonFromAddress))
            .storeBit(false)
            .storeCoins(toNano(forwardAmount))
            .storeMaybeRef(l2Data).endCell();

        return Base64.encode(payload.toBoc());
    };

    async sendJettonWithProxyMsg(params: JettonProxyMsgParameters) {
        if (params.tonAmount && params.tonAmount <= 0.2){
            throw Error("Amount of TON cannot be less than 0.2")
        }

        const jettonAddress = await this.getUserJettonWalletAddress(params.fromAddress, params.tokenAddress);
        const transaction: SendTransactionRequest = {
            validUntil: +new Date() + 15 * 60 * 1000,
            messages: [
                {
                    address: jettonAddress,
                    amount: toNano(params.tonAmount?.toFixed(9) ?? "0.35").toString(),
                    payload: this.getJettonBase64Payload(params.jettonAmount, params.fromAddress, params.proxyMsg).toString()
                }
            ],
            network: this.network
        };

        console.log('*****Sending transaction: ', transaction);
        return await params.tonConnect.sendTransaction(transaction);
    };
}




