import { Address, TonClient } from '@ton/ton';

import { ILogger, IToncenterV3Indexer } from '../interfaces';
import {
    DEFAULT_FIND_TX_MAX_DEPTH,
    DEFAULT_RETRY_ON_NOT_FOUND,
    DEFAULT_RETRY_ON_NOT_FOUND_DELAY_MS,
    DEFAULT_RETRY_ON_NOT_FOUND_RETRIES,
} from '../sdk/Consts';
import { normalizeHashToBase64, sleep } from '../sdk/Utils';
import {
    ToncenterV3IndexedTransaction,
    TrackTransactionTreeParams,
    TrackTransactionTreeResult,
    TransactionTreeDirection,
    TransactionValidationError,
} from '../structs/Struct';
import { TonClientOpener } from './TonClientOpener';

export class ToncenterV3Opener extends TonClientOpener {
    constructor(
        private readonly indexer: IToncenterV3Indexer,
        client: TonClient,
        logger?: ILogger,
    ) {
        super(client, logger);
    }

    async trackTransactionTreeWithResult(
        address: string,
        hash: string,
        params: TrackTransactionTreeParams = {},
    ): Promise<TrackTransactionTreeResult> {
        const {
            maxDepth = DEFAULT_FIND_TX_MAX_DEPTH,
            direction = TransactionTreeDirection.FORWARD,
            retryOnNotFound = DEFAULT_RETRY_ON_NOT_FOUND,
            retryDelayMs = DEFAULT_RETRY_ON_NOT_FOUND_DELAY_MS,
            retries = DEFAULT_RETRY_ON_NOT_FOUND_RETRIES,
        } = params;
        const rootAddress = Address.parse(address);
        const rootHash = normalizeHashToBase64(hash);
        const attempts = retryOnNotFound ? retries + 1 : 1;
        let rootTransaction: ToncenterV3IndexedTransaction | null = null;

        for (let attempt = 0; attempt < attempts; attempt++) {
            rootTransaction = await this.findRootTransaction(rootAddress, rootHash);
            if (rootTransaction) {
                break;
            }
            if (attempt < attempts - 1) {
                await sleep(retryDelayMs);
            }
        }

        if (!rootTransaction) {
            return {
                success: false,
                checkedCount: 0,
                error: {
                    txHash: rootHash,
                    exitCode: 'N/A',
                    resultCode: 'N/A',
                    reason: 'not_found',
                    address: rootAddress.toString(),
                },
            };
        }

        const queue = [{ transaction: rootTransaction, depth: 0 }];
        const processedTxHashes = new Set<string>();
        let checkedCount = 0;

        for (let i = 0; i < queue.length; i++) {
            const { transaction: tx, depth } = queue[i];
            if (processedTxHashes.has(tx.hash)) {
                continue;
            }
            processedTxHashes.add(tx.hash);
            checkedCount += 1;

            const validationError = this.validateIndexedTransactionWithResult(tx);
            if (validationError) {
                return { success: false, checkedCount, error: validationError };
            }

            if (depth >= maxDepth) {
                continue;
            }

            const adjacentTransactions = await this.indexer.getAdjacentTransactions(tx.hash);
            for (const adjacentTransaction of adjacentTransactions) {
                if (
                    (direction !== TransactionTreeDirection.BACKWARD &&
                        tx.outMsgs.some((message) => message.hash && message.hash === adjacentTransaction.inMsg?.hash)) ||
                    (direction !== TransactionTreeDirection.FORWARD &&
                        adjacentTransaction.outMsgs.some((message) => message.hash && message.hash === tx.inMsg?.hash))
                ) {
                    queue.push({ transaction: adjacentTransaction, depth: depth + 1 });
                }
            }
        }

        return { success: true, checkedCount };
    }

    private async findRootTransaction(
        address: Address,
        hash: string,
    ): Promise<ToncenterV3IndexedTransaction | null> {
        const tx = await this.indexer.getTransactionByHash(hash);
        if (tx && Address.parse(tx.account).equals(address)) {
            return tx;
        }

        for (const direction of ['in', 'out'] as const) {
            const transactions = await this.indexer.getTransactionsByMessageHash(hash, direction);
            const transaction = transactions.find((tx) => Address.parse(tx.account).equals(address));
            if (transaction) {
                return transaction;
            }
        }

        return null;
    }

    private validateIndexedTransactionWithResult(tx: ToncenterV3IndexedTransaction): TransactionValidationError | null {
        const { description } = tx;
        if (description?.type && description.type !== 'generic') {
            return null;
        }

        const computePh = description?.computePh;
        const action = description?.action;
        const exitCode = computePh && !computePh.skipped ? computePh.exitCode ?? 'N/A' : ('N/A' as const);
        const resultCode = action ? action.resultCode ?? 'N/A' : ('N/A' as const);

        let reason: TransactionValidationError['reason'] | null = null;
        if (description?.aborted) {
            reason = 'aborted';
        } else if (!computePh) {
            reason = 'compute_phase_missing';
        } else if (!computePh.skipped && (computePh.success !== true || computePh.exitCode !== 0)) {
            reason = 'compute_phase_failed';
        } else if (action && (action.success !== true || action.resultCode !== 0)) {
            reason = 'action_phase_failed';
        }

        return reason ? { txHash: tx.hash, exitCode, resultCode, reason } : null;
    }
}
