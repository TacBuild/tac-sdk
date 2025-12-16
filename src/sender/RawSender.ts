import { Cell, fromNano, internal, loadMessage, WalletContractV3R1, WalletContractV3R2, WalletContractV4, WalletContractV5R1 } from '@ton/ton';
import { MessageRelaxed, SendMode } from '@ton/ton';

import type { Asset, ContractOpener } from '../interfaces';
import { SenderAbstraction, WalletInstanse } from '../interfaces';
import { createWalletV3Transfer, createWalletV4Transfer, createWalletV5R1Transfer, getNormalizedExtMessageHash } from '../sdk/Utils';
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
                let externalMsgBoc: string | undefined;
                if (typeof result === 'string') {
                    externalMsgBoc = result;
                } else if (result && typeof result === 'object' && 'result' in result && typeof result.result === 'string') {
                    externalMsgBoc = result.result;
                }
                
                // Convert BoC to normalized hash
                let normalizedHash = '';
                if (externalMsgBoc) {
                    try {
                        const cell = Cell.fromBase64(externalMsgBoc);
                        const message = loadMessage(cell.beginParse());
                        if (message.info.type === 'external-in') {
                            normalizedHash = getNormalizedExtMessageHash(message);
                        }
                    } catch {
                        // If conversion fails, leave empty
                    }
                }
                
                results.push({
                    hash: normalizedHash,
                    success: true,
                    result,
                    lastMessageIndex: currentMessageIndex + batch.length - 1,
                });
            } catch (error) {
                results.push({
                    hash: '',
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

    private async sendBatch(messages: MessageRelaxed[], contractOpener: ContractOpener): Promise<unknown> {
        const walletContract = contractOpener.open(this.wallet);
        const seqno = await walletContract.getSeqno();

        // Try to create BoC locally for standard wallets
        let externalMsgBoc: string | undefined;
        
        if (this.wallet instanceof WalletContractV3R1 || this.wallet instanceof WalletContractV3R2) {
            externalMsgBoc = createWalletV3Transfer({
                seqno,
                secretKey: this.secretKey,
                messages,
                sendMode: SendMode.PAY_GAS_SEPARATELY,
                walletId: this.wallet.walletId,
            });
        } else if (this.wallet instanceof WalletContractV4) {
            externalMsgBoc = createWalletV4Transfer({
                seqno,
                secretKey: this.secretKey,
                messages,
                sendMode: SendMode.PAY_GAS_SEPARATELY,
                walletId: this.wallet.walletId,
            });
        } else if (this.wallet instanceof WalletContractV5R1) {
            externalMsgBoc = createWalletV5R1Transfer({
                seqno,
                secretKey: this.secretKey,
                messages,
                sendMode: SendMode.PAY_GAS_SEPARATELY,
                walletId: this.wallet.walletId,
            });
        }

        // Send the transaction
        const result = await walletContract.sendTransfer({
            seqno,
            secretKey: this.secretKey,
            messages,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
        });

        // Return BoC if we created it locally, otherwise return the wallet's result
        return externalMsgBoc || result;
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
        let externalMsgBoc: string | undefined;
        if (typeof result === 'string') {
            externalMsgBoc = result;
        } else if (result && typeof result === 'object' && 'result' in result && typeof result.result === 'string') {
            externalMsgBoc = result.result;
        }
        
        // Convert BoC to normalized hash
        let normalizedHash = '';
        if (externalMsgBoc) {
            try {
                const cell = Cell.fromBase64(externalMsgBoc);
                const message = loadMessage(cell.beginParse());
                if (message.info.type === 'external-in') {
                    normalizedHash = getNormalizedExtMessageHash(message);
                }
            } catch {
                // If conversion fails, leave empty
            }
        }
        
        return {
            hash: normalizedHash,
            success: true,
            result,
            lastMessageIndex: shardTransaction.messages.length - 1,
        };
    }
}
