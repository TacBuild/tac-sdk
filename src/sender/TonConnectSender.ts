import { Base64 } from '@tonconnect/protocol';
import type { SendTransactionRequest } from '@tonconnect/ui';
import { CHAIN, TonConnectUI } from '@tonconnect/ui';

import type { ShardTransaction } from '../structs/InternalStruct';
import { ContractOpener, Network } from '../structs/Struct';
import { SenderAbstraction, sleep } from './SenderAbstraction';
import { SendTransactionResponse } from '@tonconnect/sdk';

const CHUNK_SIZE = 4; // TODO: how to detect that tonConnect connected to W5 and CHUNK_SIZE is 254?

export class TonConnectSender implements SenderAbstraction {
    readonly tonConnect: TonConnectUI;

    constructor(tonConnect: TonConnectUI) {
        this.tonConnect = tonConnect;
    }

    private async sendChunkedMessages(messages: SendTransactionRequest['messages'], validUntil: number, chain: Network): Promise<SendTransactionResponse[]> {
        const responses: SendTransactionResponse[] = [];
        
        for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
            const chunk = messages.slice(i, i + CHUNK_SIZE);
            const transaction: SendTransactionRequest = {
                validUntil,
                messages: chunk,
                network: chain == Network.TESTNET ? CHAIN.TESTNET : CHAIN.MAINNET,
            };
            
            const response = await this.tonConnect.sendTransaction(transaction);
            responses.push(response);
            
            if (i + CHUNK_SIZE < messages.length) {
                await sleep(1000);
            }
        }
        
        return responses;
    }

    async sendShardTransactions(shardTransactions: ShardTransaction[], delay: number, chain: Network, contractOpener?: ContractOpener): Promise<SendTransactionResponse[]> {
        const allMessages = [];
        let minValidUntil = 0;
        
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

    async sendShardTransaction(
        shardTransaction: ShardTransaction,
        delay: number,
        chain: Network,
    ): Promise<SendTransactionResponse> {
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
