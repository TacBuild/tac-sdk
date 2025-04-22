import { Base64 } from '@tonconnect/protocol';
import type { SendTransactionRequest } from '@tonconnect/ui';
import { CHAIN, TonConnectUI } from '@tonconnect/ui';

import type { ShardTransaction } from '../structs/InternalStruct';
import { ContractOpener, Network } from '../structs/Struct';
import { SenderAbstraction, sleep } from './SenderAbstraction';
import { SendTransactionResponse } from '@tonconnect/sdk';

export class TonConnectSender implements SenderAbstraction {
    readonly tonConnect: TonConnectUI;

    constructor(tonConnect: TonConnectUI) {
        this.tonConnect = tonConnect;
    }

    async sendShardTransactions(shardTransactions: ShardTransaction[], delay: number, chain?: Network, contractOpener?: ContractOpener): Promise<SendTransactionResponse[]> {
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

        const transaction: SendTransactionRequest = {
            validUntil: minValidUntil,
            messages: allMessages,
            network: chain == Network.TESTNET ? CHAIN.TESTNET : CHAIN.MAINNET,
        };

        await sleep(delay * 1000);
        const response = await this.tonConnect.sendTransaction(transaction);
        return [response];
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

        const transaction: SendTransactionRequest = {
            validUntil: shardTransaction.validUntil,
            messages,
            network: chain == Network.TESTNET ? CHAIN.TESTNET : CHAIN.MAINNET,
        };

        await sleep(delay * 1000);
        return this.tonConnect.sendTransaction(transaction);
    }
}
