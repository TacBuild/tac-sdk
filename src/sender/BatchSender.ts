import { fromNano, internal, MessageRelaxed, SendMode } from '@ton/ton';

import type { ContractOpener } from '../structs/Struct';
import type { ShardTransaction } from '../structs/InternalStruct';
import { Network } from '../structs/Struct';
import { SenderAbstraction, sleep } from './SenderAbstraction';
import { MAX_HIGHLOAD_GROUP_MSG_NUM, MAX_EXT_MSG_SIZE, MAX_MSG_DEPTH } from '../sdk/Consts';
import { HighloadWalletV3 } from '../wrappers/HighloadWalletV3';
import { prepareMessageGroupError, noValidGroupFoundError } from '../errors/instances';

export class BatchSender implements SenderAbstraction {
    constructor(
        private wallet: HighloadWalletV3,
        private secretKey: Buffer,
    ) {}

    async sendShardTransactions(
        shardTransactions: ShardTransaction[],
        delay: number,
        _chain: Network,
        contractOpener: ContractOpener,
    ): Promise<unknown> {
        const allMessages: MessageRelaxed[] = [];
        let minValidUntil = Number.MAX_SAFE_INTEGER;

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
            minValidUntil = Math.min(minValidUntil, transaction.validUntil);
        }

        const groups = await this.prepareGroups(allMessages);

        const results = [];
        for (const group of groups) {
            await sleep(delay * 1000);
            const result = await this.sendGroup(group, contractOpener);
            results.push(result);
        }

        return results;
    }

    private async prepareGroups(messages: MessageRelaxed[]): Promise<MessageRelaxed[][]> {
        const total = messages.length;
        let left = 0;
        const groups: MessageRelaxed[][] = [];

        while (left < total) {
            let groupSize = total - left;
            if (groupSize > MAX_HIGHLOAD_GROUP_MSG_NUM) {
                groupSize = MAX_HIGHLOAD_GROUP_MSG_NUM;
            }

            let validGroupFound = false;

            while (groupSize > 0) {
                const group = messages.slice(left, left + groupSize);
                const createdAt = Math.floor(Date.now() / 1000) - 40;
                const queryId = this.wallet.getQueryIdFromCreatedAt(createdAt);
                const externalMsg = this.wallet.getExternalMessage(group, SendMode.PAY_GAS_SEPARATELY, 0n, queryId);

                const isBocSizeValid = externalMsg.body.toBoc().length <= MAX_EXT_MSG_SIZE;
                const isDepthValid = externalMsg.body.depth() <= MAX_MSG_DEPTH;

                if (isBocSizeValid && isDepthValid) {
                    groups.push(group);
                    left += groupSize;
                    validGroupFound = true;
                    break;
                }

                if (groupSize <= 1) {
                    throw prepareMessageGroupError(isBocSizeValid, isDepthValid);
                }

                groupSize = Math.floor(groupSize / 2);
            }

            if (!validGroupFound) {
                throw noValidGroupFoundError;
            }
        }

        return groups;
    }

    private async sendGroup(messages: MessageRelaxed[], contractOpener: ContractOpener): Promise<unknown> {
        const walletContract = contractOpener.open(this.wallet);

        return walletContract.sendTransfer({
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
        delay: number,
        _chain: Network,
        contractOpener: ContractOpener,
    ): Promise<unknown> {
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
        return this.sendGroup(messages, contractOpener);
    }
}
