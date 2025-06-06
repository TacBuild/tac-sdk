import { Base64 } from '@tonconnect/protocol';
import type { SendTransactionRequest } from '@tonconnect/ui';
import { CHAIN, TonConnectUI } from '@tonconnect/ui';

import type { SendResult, ShardTransaction } from '../structs/InternalStruct';
import { ContractOpener, Network } from '../structs/Struct';
import { SenderAbstraction, sleep } from './SenderAbstraction';

const CHUNK_SIZE = 4;

export class TonConnectSender implements SenderAbstraction {
    readonly tonConnect: TonConnectUI;

    constructor(tonConnect: TonConnectUI) {
        this.tonConnect = tonConnect;
    }

    private async sendChunkedMessages(
        messages: SendTransactionRequest['messages'],
        validUntil: number,
        chain: Network,
    ): Promise<SendResult[]> {
        const responses: SendResult[] = [];
        let currentMessageIndex = 0;

        const chunkSize =
            //@ts-ignore // 'find' checks that maxMessages is a property of the feature
            this.tonConnect.wallet?.device.features.find((feat) => feat.hasOwnProperty('maxMessages'))?.maxMessages ||
            CHUNK_SIZE;

        for (let i = 0; i < messages.length; i += chunkSize) {
            const chunk = messages.slice(i, i + chunkSize);
            const transaction: SendTransactionRequest = {
                validUntil,
                messages: chunk,
                network: chain == Network.TESTNET ? CHAIN.TESTNET : CHAIN.MAINNET,
            };

            try {
                const response = await this.tonConnect.sendTransaction(transaction);
                responses.push({
                    success: true,
                    result: response,
                    lastMessageIndex: currentMessageIndex + chunk.length - 1,
                });
                currentMessageIndex += chunk.length;
            } catch (error) {
                responses.push({
                    success: false,
                    error: error as Error,
                    lastMessageIndex: currentMessageIndex - 1,
                });
                break; // Stop sending after first error
            }

            if (i + chunkSize < messages.length) {
                await sleep(1000);
            }
        }

        return responses;
    }

    async sendShardTransactions(
        shardTransactions: ShardTransaction[],
        delay: number,
        chain: Network,
        _contractOpener?: ContractOpener,
    ): Promise<SendResult[]> {
        const allMessages = [];
        let minValidUntil = Number.MAX_SAFE_INTEGER;

        for (const transaction of shardTransactions) {
            for (const message of transaction.messages) {
                allMessages.push({
                    address: message.address,
                    amount: message.value.toString(),
                    payload: Base64.encode(message.payload.toBoc()).toString(),
                });
            }
            minValidUntil = Math.min(minValidUntil, transaction.validUntil);
        }

        await sleep(delay * 1000);
        return this.sendChunkedMessages(allMessages, minValidUntil, chain);
    }

    getSenderAddress(): string {
        return this.tonConnect.account?.address?.toString() || '';
    }

    async sendShardTransaction(shardTransaction: ShardTransaction, delay: number, chain: Network): Promise<SendResult> {
        const messages = [];
        for (const message of shardTransaction.messages) {
            messages.push({
                address: message.address,
                amount: message.value.toString(),
                payload: Base64.encode(message.payload.toBoc()).toString(),
            });
        }

        await sleep(delay * 1000);
        const responses = await this.sendChunkedMessages(messages, shardTransaction.validUntil, chain);
        return responses[0];
    }
}
