import { address } from '@ton/ton';

import { Asset, ContractOpener, ITonConnectUI, SenderAbstraction } from '../interfaces';
import { TON_MAINNET_GLOBAL_ID, TON_TESTNET_GLOBAL_ID } from '../sdk/Consts';
import { sleep } from '../sdk/Utils';
import type { SendResult, ShardTransaction } from '../structs/InternalStruct';
import { Network } from '../structs/Struct';

const CHUNK_SIZE = 4;

export class TonConnectSender implements SenderAbstraction {
    readonly tonConnect: ITonConnectUI;

    constructor(tonConnect: ITonConnectUI) {
        this.tonConnect = tonConnect;
    }

    async getBalanceOf(asset: Asset): Promise<bigint> {
        return asset.getBalanceOf(this.getSenderAddress());
    }

    async getBalance(contractOpener: ContractOpener): Promise<bigint> {
        return this.tonConnect.account
            ? (await contractOpener.getContractState(address(this.tonConnect.account?.address))).balance
            : 0n;
    }

    private async sendChunkedMessages(
        messages: { address: string; amount: string; payload: string }[],
        validUntil: number,
        chain: Network,
    ): Promise<SendResult[]> {
        const responses: SendResult[] = [];
        let currentMessageIndex = 0;

        const chunkSize =
            this.tonConnect.wallet?.device.features.find(
                (feature): feature is { maxMessages: number } =>
                    typeof feature === 'object' &&
                    feature !== null &&
                    'maxMessages' in feature &&
                    typeof feature.maxMessages === 'number',
            )?.maxMessages || CHUNK_SIZE;

        for (let i = 0; i < messages.length; i += chunkSize) {
            const chunk = messages.slice(i, i + chunkSize);
            const transaction = {
                validUntil,
                messages: chunk,
                network: (chain === Network.MAINNET ? TON_MAINNET_GLOBAL_ID : TON_TESTNET_GLOBAL_ID).toString(),
            };

            try {
                const response = await this.tonConnect.sendTransaction(transaction);
                responses.push({
                    success: true,
                    result: response,
                    boc: response.boc,
                    lastMessageIndex: currentMessageIndex + chunk.length - 1,
                });
                currentMessageIndex += chunk.length;
            } catch (error) {
                responses.push({
                    success: false,
                    boc: '',
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
                    payload: message.payload.toBoc().toString('base64'),
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
                payload: message.payload.toBoc().toString('base64'),
            });
        }

        const responses = await this.sendChunkedMessages(messages, shardTransaction.validUntil, chain);
        return responses[0];
    }
}
