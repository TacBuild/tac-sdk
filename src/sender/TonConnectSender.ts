import { address } from '@ton/ton';
import { Base64 } from '@tonconnect/protocol';
import type { SendTransactionRequest } from '@tonconnect/ui';
import { CHAIN, TonConnectUI } from '@tonconnect/ui';

import type { SendResult, ShardTransaction } from '../structs/InternalStruct';
import { IAsset, IContractOpener, Network } from '../structs/Struct';
import { ISender } from '../interfaces';
import { sleep } from '../sdk/Utils';

const CHUNK_SIZE = 4;

export class TonConnectSender implements ISender {
    readonly tonConnect: TonConnectUI;

    constructor(tonConnect: TonConnectUI) {
        this.tonConnect = tonConnect;
    }

    async getBalanceOf(asset: IAsset): Promise<bigint> {
        return asset.getBalanceOf(this.getSenderAddress());
    }

    async getBalance(contractOpener: IContractOpener): Promise<bigint> {
        return this.tonConnect.account
            ? (await contractOpener.getContractState(address(this.tonConnect.account?.address))).balance
            : 0n;
    }

    private async sendChunkedMessages(
        messages: SendTransactionRequest['messages'],
        validUntil: number,
        chain: Network,
    ): Promise<SendResult[]> {
        const responses: SendResult[] = [];
        let currentMessageIndex = 0;

        const chunkSize =
            this.tonConnect.wallet?.device.features.find(
                (feat) => Object.prototype.hasOwnProperty.call(feat, 'maxMessages'),
                //@ts-expect-error // 'find' checks that maxMessages is a property of the feature
            )?.maxMessages || CHUNK_SIZE;

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

    async sendShardTransactions(shardTransactions: ShardTransaction[], chain: Network): Promise<SendResult[]> {
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

        return this.sendChunkedMessages(allMessages, minValidUntil, chain);
    }

    getSenderAddress(): string {
        return this.tonConnect.account?.address?.toString() || '';
    }

    async sendShardTransaction(shardTransaction: ShardTransaction, chain: Network): Promise<SendResult> {
        const messages = [];
        for (const message of shardTransaction.messages) {
            messages.push({
                address: message.address,
                amount: message.value.toString(),
                payload: Base64.encode(message.payload.toBoc()).toString(),
            });
        }

        const responses = await this.sendChunkedMessages(messages, shardTransaction.validUntil, chain);
        return responses[0];
    }
}
