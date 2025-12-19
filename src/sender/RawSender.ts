import { beginCell, external, fromNano, internal, StateInit, storeMessage } from '@ton/ton';
import { MessageRelaxed, SendMode } from '@ton/ton';

import type { Asset, ContractOpener } from '../interfaces';
import { SenderAbstraction, WalletInstanse } from '../interfaces';
import type { SendResult, ShardTransaction } from '../structs/InternalStruct';
import { Network } from '../structs/Struct';

export class RawSender implements SenderAbstraction {
    constructor(
        private wallet: WalletInstanse,
        private secretKey: Buffer,
        private maxBatchSize: number = 4,
    ) {}

    async getBalanceOf(asset: Asset): Promise<bigint> {
        return asset.getBalanceOf(this.getSenderAddress());
    }

    async getBalance(contractOpener: ContractOpener): Promise<bigint> {
        const { balance } = await contractOpener.getContractState(this.wallet.address);
        return balance;
    }

    async sendShardTransactions(
        shardTransactions: ShardTransaction[],
        _chain: Network,
        contractOpener: ContractOpener,
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
                // Extract BoC if it's a string, or from sandbox result
                let externalMsgBoc: string = '';
                if (typeof result === 'string') {
                    externalMsgBoc = result;
                } else if (result?.result) {
                    externalMsgBoc = result.result;
                }

                results.push({
                    boc: externalMsgBoc,
                    success: true,
                    result,
                    lastMessageIndex: currentMessageIndex + batch.length - 1,
                });
            } catch (error) {
                results.push({
                    boc: '',
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

    private async sendBatch(
        messages: MessageRelaxed[],
        contractOpener: ContractOpener,
    ): Promise<string | void | { result: string | void }> {
        const walletContract = contractOpener.open(this.wallet);
        const seqno = await walletContract.getSeqno();

        // Try to create BoC locally for standard wallets

        const msg = this.wallet.createTransfer({
            seqno,
            secretKey: this.secretKey,
            messages,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
        });

        let neededInit: StateInit | null = null;
        if (this.wallet.init && (await contractOpener.getContractState(this.wallet.address)).state !== 'active') {
            neededInit = this.wallet.init;
        }

        const ext = external({
            to: this.wallet.address,
            init: neededInit,
            body: msg,
        });
        const boc = beginCell().store(storeMessage(ext)).endCell().toBoc().toString('base64');

        // Send the transaction
        const result = await walletContract.send(msg);

        return boc || result;
    }

    getSenderAddress(): string {
        return this.wallet.address.toString();
    }

    async sendShardTransaction(
        shardTransaction: ShardTransaction,
        _chain: Network,
        contractOpener: ContractOpener,
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
        // Extract BoC if it's a string, or from sandbox result
        let externalMsgBoc: string = '';
        if (typeof result === 'string') {
            externalMsgBoc = result;
        } else if (result?.result) {
            externalMsgBoc = result.result;
        }

        return {
            boc: externalMsgBoc,
            success: true,
            result,
            lastMessageIndex: shardTransaction.messages.length - 1,
        };
    }
}
