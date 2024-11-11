import {CHAIN, SendTransactionRequest, TonConnectUI} from "@tonconnect/ui";
import {SendMode, internal, MessageRelaxed, TonClient, WalletContractV3R2 } from "@ton/ton";
import { mnemonicToWalletKey } from "ton-crypto"; 
import { ShardTransaction } from "../structs/Struct"

export interface SenderAbstraction {
    sendTransaction(shardTransaction: ShardTransaction, chain: number | undefined, tonClient: TonClient | undefined) : Promise<void>;
    getSenderAddress(chain: number | undefined, tonClient: TonClient | undefined) : Promise<string>; 
}

export class TonConnectSender implements SenderAbstraction {
    readonly tonConnect: TonConnectUI;

    constructor(tonConnect: TonConnectUI) {
        this.tonConnect = tonConnect;
    }

    async getSenderAddress(): Promise<string> {
        return Promise.resolve(this.tonConnect.account?.address?.toString() || '');
    }
    
    async sendTransaction(shardTransaction: ShardTransaction, chain: number) {
        const messages = [];
        for (const message of shardTransaction.messages) {
            messages.push({
                address: message.address,
                amount: message.value,
                payload: message.payload,
            });
        }

        const transaction: SendTransactionRequest = {
            validUntil: shardTransaction.validUntil,
            messages,
            network: chain == 0 ? CHAIN.TESTNET : CHAIN.MAINNET,
        }; 

        await this.tonConnect.sendTransaction(transaction);
    }
}

export class RawSender implements SenderAbstraction {
    readonly mnemonic: string;

    constructor(mnemonic: string) {
        this.mnemonic = mnemonic;
    }

    private async deriveWalletKeys() {
        const keyPair = await mnemonicToWalletKey(this.mnemonic.split(" "));
        return {
            publicKey: keyPair.publicKey,
            secretKey: keyPair.secretKey,
        };
    }

    async getSenderAddress(chain: number): Promise<string> {
        const { publicKey } = await this.deriveWalletKeys();

        const wallet = WalletContractV3R2.create({
            workchain: chain,
            publicKey: publicKey,
        });

        return Promise.resolve(wallet.address.toString());
    }

    async sendTransaction(shardTransaction: ShardTransaction, chain: number, tonClient: TonClient) {
        const { publicKey, secretKey } = await this.deriveWalletKeys();

        const wallet = WalletContractV3R2.create({
            workchain: chain,
            publicKey: publicKey,
        });

        const walletContract = tonClient.open(wallet);
        console.log("pass1");
        const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
        await sleep(5000);
        const seqno = await walletContract.getSeqno();
        console.log("pass2");

        const messages : MessageRelaxed[] = []
        for (const message of shardTransaction.messages) {
            messages.push(internal({
                to: message.address,
                value: message.value,
                bounce: true,
                body: message.payload.toString(),
            }));
        }

        let sendMode = SendMode.PAY_GAS_SEPARATELY;

        console.log("pass3");
        await sleep(5000);
        await walletContract.sendTransfer({
            seqno: seqno,
            secretKey: secretKey,
            messages,
            sendMode,
        });
        console.log("pass4");
    }
}
