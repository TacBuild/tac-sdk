import {CHAIN, SendTransactionRequest, TonConnectUI} from '@tonconnect/ui';
import {toNano, internal, TonClient, WalletContractV3R2, MessageRelaxed} from '@ton/ton';
import {mnemonicToWalletKey} from 'ton-crypto';
import {Base64} from '@tonconnect/protocol';
import {Network, ShardTransaction} from '../structs/Struct';
import {sleep} from "../sdk/Utils";

export interface SenderAbstraction {
    sendShardTransaction(shardTransaction: ShardTransaction, delay: number, chain: Network | undefined, tonClient: TonClient | undefined): Promise<void>;

    getSenderAddress(): Promise<string>;
}

export class TonConnectSender implements SenderAbstraction {
    readonly tonConnect: TonConnectUI;

    constructor(tonConnect: TonConnectUI) {
        this.tonConnect = tonConnect;
    }

    async getSenderAddress(): Promise<string> {
        return Promise.resolve(this.tonConnect.account?.address?.toString() || '');
    }

    async sendShardTransaction(shardTransaction: ShardTransaction, delay: number, chain: Network) {
        const messages = [];
        for (const message of shardTransaction.messages) {
            messages.push({
                address: message.address,
                amount: toNano(message.value.toFixed(9)).toString(),
                payload: Base64.encode(message.payload.toBoc()).toString()
            });
        }

        const transaction: SendTransactionRequest = {
            validUntil: shardTransaction.validUntil,
            messages,
            network: chain == Network.Testnet ? CHAIN.TESTNET : CHAIN.MAINNET
        };

        await sleep(delay * 1000);
        await this.tonConnect.sendTransaction(transaction);
    }
}

export class RawSender implements SenderAbstraction {
    readonly mnemonic: string;

    constructor(mnemonic: string) {
        this.mnemonic = mnemonic;
    }

    private async deriveWalletKeys() {
        const keyPair = await mnemonicToWalletKey(this.mnemonic.split(' '));
        return {
            publicKey: keyPair.publicKey,
            secretKey: keyPair.secretKey
        };
    }

    async getSenderAddress(): Promise<string> {
        const {publicKey} = await this.deriveWalletKeys();

        const wallet = WalletContractV3R2.create({
            workchain: 0,
            publicKey
        });

        return Promise.resolve(wallet.address.toString());
    }

    async sendShardTransaction(shardTransaction: ShardTransaction, delay: number, chain: Network, tonClient: TonClient) {
        const {publicKey, secretKey} = await this.deriveWalletKeys();

        const wallet = WalletContractV3R2.create({
            workchain: 0,
            publicKey
        });

        const walletContract = tonClient.open(wallet);
        await sleep(delay * 1000);
        const seqno = await walletContract.getSeqno();

        const messages: MessageRelaxed[] = [];
        for (const message of shardTransaction.messages) {
            messages.push(internal({
                to: message.address,
                value: message.value.toString(),
                bounce: true,
                body: message.payload
            }));
        }

        await sleep(delay * 1000);
        await walletContract.sendTransfer({
            seqno,
            secretKey,
            messages
        });
    }
}
