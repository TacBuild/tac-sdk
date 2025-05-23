import { fromNano, internal } from '@ton/ton';
import { MessageRelaxed, SendMode } from '@ton/ton';

import type { ContractOpener } from '../structs/Struct';
import type { SendResult, ShardTransaction } from '../structs/InternalStruct';
import { Network } from '../structs/Struct';
import { SenderAbstraction, sleep, WalletInstance } from './SenderAbstraction';

export class RawSender implements SenderAbstraction {
    constructor(
        private wallet: WalletInstance,
        private secretKey: Buffer,
    ) {}

    async sendShardTransactions(
        shardTransactions: ShardTransaction[],
        delay: number,
        chain: Network,
        contractOpener: ContractOpener,
    ): Promise<SendResult[]> {
        const results: SendResult[] = [];
        let currentMessageIndex = 0;

        for (const shardTx of shardTransactions) {
            try {
                const result = await this.sendShardTransaction(shardTx, delay, chain, contractOpener);
                results.push({
                    success: true,
                    result,
                    lastMessageIndex: currentMessageIndex + shardTx.messages.length - 1,
                });
                currentMessageIndex += shardTx.messages.length;
            } catch (error) {
                results.push({
                    success: false,
                    error: error as Error,
                    lastMessageIndex: currentMessageIndex - 1,
                });
                break; // Stop sending after first error
            }
        }
        return results;
    }

    getSenderAddress(): string {
        return this.wallet.address.toString();
    }

    async sendShardTransaction(
        shardTransaction: ShardTransaction,
        delay: number,
        _chain: Network,
        contractOpener: ContractOpener,
    ): Promise<SendResult> {
        const walletContract = contractOpener.open(this.wallet);
        await sleep(delay * 1000);
        const seqno = await walletContract.getSeqno();

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

        await sleep(delay * 1000);
        const result = await walletContract.sendTransfer({
            seqno,
            secretKey: this.secretKey,
            messages,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
        });
        return {
            success: true,
            result,
            lastMessageIndex: shardTransaction.messages.length - 1,
        };
    }
}
