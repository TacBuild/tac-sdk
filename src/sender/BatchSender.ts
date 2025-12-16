import { Cell, fromNano, internal, loadMessage, MessageRelaxed, SendMode } from '@ton/ton';

import { noValidGroupFoundError, prepareMessageGroupError } from '../errors/instances';
import type { Asset, ContractOpener, SenderAbstraction } from '../interfaces';
import { MAX_EXT_MSG_SIZE, MAX_HIGHLOAD_GROUP_MSG_NUM, MAX_MSG_DEPTH } from '../sdk/Consts';
import { getNormalizedExtMessageHash } from '../sdk/Utils';
import type { SendResult, ShardTransaction } from '../structs/InternalStruct';
import { Network } from '../structs/Struct';
import { HighloadWalletV3 } from '../wrappers/HighloadWalletV3';

export class BatchSender implements SenderAbstraction {
    private lastCreatedAt: number;

    constructor(
        private wallet: HighloadWalletV3,
        private secretKey: Buffer,
    ) {
        this.lastCreatedAt = 0;
    }

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

        const results: SendResult[] = [];
        let currentMessageIndex = 0;

        for (const group of groups) {
            try {
                const result = await this.sendGroup(group, contractOpener);
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
                    lastMessageIndex: currentMessageIndex + group.length - 1,
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
            currentMessageIndex += group.length;
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

        let createdAt = HighloadWalletV3.generateCreatedAt();
        if (createdAt <= this.lastCreatedAt) {
            createdAt = this.lastCreatedAt + 1; // to prevent error::already_executed on highload wallet
        }
        this.lastCreatedAt = createdAt;

        return walletContract.sendTransfer({
            secretKey: this.secretKey,
            messages,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            createdAt,
        });
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

        const result = await this.sendGroup(messages, contractOpener);
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
