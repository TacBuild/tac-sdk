import { fromNano, internal } from '@ton/ton';
import { MessageRelaxed, SendMode } from '@ton/ton';

import type { SendResult, ShardTransaction } from '../structs/InternalStruct';
import type { IAsset, IContractOpener } from '../interfaces';
import { Network } from '../structs/Struct';
import { ISender, IWallet } from '../interfaces';

export class RawSender implements ISender {
    constructor(
        private wallet: IWallet,
        private secretKey: Buffer,
        private maxBatchSize: number = 4,
    ) {}

    async getBalanceOf(asset: IAsset): Promise<bigint> {
        return asset.getBalanceOf(this.getSenderAddress());
    }

    async getBalance(contractOpener: IContractOpener): Promise<bigint> {
        const { balance } = await contractOpener.getContractState(this.wallet.address);
        return balance;
    }

    async sendShardTransactions(
        shardTransactions: ShardTransaction[],
        _chain: Network,
        contractOpener: IContractOpener,
    ): Promise<SendResult[]> {
        const allMessages: MessageRelaxed[] = [];

        for (const transaction of shardTransactions) {
            for (const message of transaction.messages) {
                allMessages.push(
                    internal({
                        to: message.address,
                        value: fromNano(message.value),
                        bounce: true,
                        body: message.payload,
                    }),
                );
            }
        }

        const batches = this.prepareBatches(allMessages);

        const results: SendResult[] = [];
        let currentMessageIndex = 0;

        for (const batch of batches) {
            try {
                const result = await this.sendBatch(batch, contractOpener);
                results.push({
                    success: true,
                    result,
                    lastMessageIndex: currentMessageIndex + batch.length - 1,
                });
            } catch (error) {
                results.push({
                    success: false,
                    error: error as Error,
                    lastMessageIndex: currentMessageIndex - 1,
                });
                break; // Stop sending after first error
            }
            currentMessageIndex += batch.length;
        }

        return results;
    }

    private prepareBatches(messages: MessageRelaxed[]): MessageRelaxed[][] {
        const batches: MessageRelaxed[][] = [];

        for (let i = 0; i < messages.length; i += this.maxBatchSize) {
            const batch = messages.slice(i, i + this.maxBatchSize);
            batches.push(batch);
        }

        return batches;
    }

    private async sendBatch(messages: MessageRelaxed[], contractOpener: IContractOpener): Promise<unknown> {
        const walletContract = contractOpener.open(this.wallet);
        const seqno = await walletContract.getSeqno();

        return walletContract.sendTransfer({
            seqno,
            secretKey: this.secretKey,
            messages,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
        });
    }

    getSenderAddress(): string {
        return this.wallet.address.toString();
    }

    async sendShardTransaction(
        shardTransaction: ShardTransaction,
        _chain: Network,
        contractOpener: IContractOpener,
    ): Promise<SendResult> {
        const messages: MessageRelaxed[] = [];
        for (const message of shardTransaction.messages) {
            messages.push(
                internal({
                    to: message.address,
                    value: fromNano(message.value),
                    bounce: true,
                    body: message.payload,
                }),
            );
        }

        const result = await this.sendBatch(messages, contractOpener);
        return {
            success: true,
            result,
            lastMessageIndex: shardTransaction.messages.length - 1,
        };
    }
}
