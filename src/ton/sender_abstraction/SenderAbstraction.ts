import { CHAIN, TonConnectUI } from "@tonconnect/ui";
import type { SendTransactionRequest } from "@tonconnect/ui"; 
import { internal, TonClient, WalletContractV3R2 } from "@ton/ton";
import type { MessageRelaxed } from "@ton/ton";
import { mnemonicToWalletKey } from "ton-crypto"; 
import { Network } from "../structs/Struct";
import type { ShardTransaction } from "../structs/Struct";
import { Base64 } from '@tonconnect/protocol';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export interface SenderAbstraction {
    sendShardJettonTransferTransaction(shardTransaction: ShardTransaction, delay: number, chain: Network | undefined, tonClient: TonClient | undefined) : Promise<void>;
    getSenderAddress(chain: Network | undefined, tonClient: TonClient | undefined) : Promise<string>; 
}

export class TonConnectSender implements SenderAbstraction {
    readonly tonConnect: TonConnectUI;

    constructor(tonConnect: TonConnectUI) {
        this.tonConnect = tonConnect;
    }

    async getSenderAddress(): Promise<string> {
        return Promise.resolve(this.tonConnect.account?.address?.toString() || '');
    }
    
    async sendShardJettonTransferTransaction(shardTransaction: ShardTransaction, delay: number, chain: Network) {
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
            network: chain == Network.Testnet ? CHAIN.TESTNET : CHAIN.MAINNET,
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

    async getSenderAddress(chain: Network): Promise<string> {
        const { publicKey } = await this.deriveWalletKeys();

        const wallet = WalletContractV3R2.create({
            workchain: chain == Network.Testnet ? 0 : 1,
            publicKey: publicKey,
        });

        return Promise.resolve(wallet.address.toString());
    }

    async sendShardJettonTransferTransaction(shardTransaction: ShardTransaction, delay: number, chain: Network, tonClient: TonClient) {
        const { publicKey, secretKey } = await this.deriveWalletKeys();

        const wallet = WalletContractV3R2.create({
            workchain: chain == Network.Testnet ? 0 : 1,
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
