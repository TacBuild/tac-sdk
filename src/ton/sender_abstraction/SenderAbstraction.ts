import {CHAIN, SendTransactionRequest, TonConnectUI} from "@tonconnect/ui";
import { internal, MessageRelaxed, TonClient, WalletContractV3R2 } from "@ton/ton";
import { mnemonicToWalletKey } from "ton-crypto"; 
import { ShardTransaction } from "../structs/Struct"
import {Base64} from '@tonconnect/protocol';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export interface SenderAbstraction {
    sendTransaction(shardTransaction: ShardTransaction, delay: number, chain: number | undefined, tonClient: TonClient | undefined) : Promise<void>;
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
    
    async sendTransaction(shardTransaction: ShardTransaction, delay: number, chain: number) {
        const messages = [];
        for (const message of shardTransaction.messages) {
            messages.push({
                address: message.address,
                amount: message.value,
                payload: Base64.encode(message.payload).toString(),
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

    async sendTransaction(shardTransaction: ShardTransaction, delay: number, chain: number, tonClient: TonClient) {
        const { publicKey, secretKey } = await this.deriveWalletKeys();

        const wallet = WalletContractV3R2.create({
            workchain: chain,
            publicKey: publicKey,
        });

        const walletContract = tonClient.open(wallet);
        await sleep(delay*1000);
        const seqno = await walletContract.getSeqno();

        const messages : MessageRelaxed[] = []
        for (const message of shardTransaction.messages) {
            messages.push(internal({
                to: message.address,
                value: message.value,
                bounce: true,
                body: message.payload,
            }));
        }

        await sleep(delay*1000);
        await walletContract.sendTransfer({
            seqno: seqno,
            secretKey: secretKey,
            messages,
        });
    }
}
