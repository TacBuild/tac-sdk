import { Address } from '@ton/ton';

import { operationFetchError } from '../errors';
import { IHttpClient, IToncenterV3Indexer } from '../interfaces';
import { AxiosHttpClient } from '../sdk/AxiosHttpClient';
import { DEFAULT_FIND_TX_LIMIT, DEFAULT_FIND_TX_MAX_DEPTH, DEFAULT_MAX_SCANNED_TRANSACTIONS } from '../sdk/Consts';
import { toCamelCaseTransformer } from '../sdk/Utils';
import { TonAdjacentTransactionsResponse, ToncenterV3TransactionsResponse } from '../structs/InternalStruct';
import { ToncenterV3IndexedTransaction, ToncenterV3TraversalParams } from '../structs/Struct';

const HTTP_NOT_FOUND_STATUS_CODE = 404;

/**
 * Thin Toncenter v3 indexer client for resolving indexed TON transaction context by hash and
 * traversing a linked chain of TON transactions until it finds the sequencer-collected event transaction on CCL.
 */
export class ToncenterV3Indexer implements IToncenterV3Indexer {
    readonly endpoint: string;
    private readonly httpClient: IHttpClient;

    constructor(endpoint: string, httpClient: IHttpClient = new AxiosHttpClient()) {
        this.endpoint = endpoint;
        this.httpClient = httpClient;
    }

    /**
     * Queries Toncenter v3 indexed `/transactions` endpoint by hash and returns the first match.
     * @param transactionHash TON transaction hash accepted by the indexer.
     * @returns Indexed transaction with owning account context, or null on 404 / empty result.
     */
    async getTransactionByHash(transactionHash: string): Promise<ToncenterV3IndexedTransaction | null> {
        const endpoint = this.endpoint.endsWith('/') ? `${this.endpoint}transactions` : `${this.endpoint}/transactions`;
        const requestLabel = `GET ${endpoint}`;

        try {
            const response = await this.httpClient.get<ToncenterV3TransactionsResponse>(endpoint, {
                params: {
                    hash: transactionHash,
                    limit: DEFAULT_FIND_TX_LIMIT,
                },
                transformResponse: [toCamelCaseTransformer],
            });
            return response.data.transactions?.[0] ?? null;
        } catch (error) {
            if ((error as { response?: { status?: number } }).response?.status === HTTP_NOT_FOUND_STATUS_CODE) {
                return null;
            }
            throw operationFetchError(`request ${requestLabel} failed to resolve TON indexed transaction`, error);
        }
    }

    async getTransactionsByMessageHash(
        messageHash: string,
        direction: 'in' | 'out',
    ): Promise<ToncenterV3IndexedTransaction[]> {
        const endpoint = this.endpoint.endsWith('/')
            ? `${this.endpoint}transactionsByMessage`
            : `${this.endpoint}/transactionsByMessage`;

        try {
            const { data } = await this.httpClient.get<ToncenterV3TransactionsResponse>(endpoint, {
                params: {
                    msg_hash: messageHash,
                    direction,
                    limit: DEFAULT_FIND_TX_LIMIT,
                },
                transformResponse: [toCamelCaseTransformer],
            });
            return data.transactions ?? [];
        } catch (error) {
            if ((error as { response?: { status?: number } }).response?.status === HTTP_NOT_FOUND_STATUS_CODE) {
                return [];
            }
            throw operationFetchError(`request GET ${endpoint} failed to resolve TON indexed transactions by message`, error);
        }
    }

    /**
     * Queries Toncenter v3 indexed `/adjacentTransactions` endpoint by hash.
     * @param transactionHash TON transaction hash accepted by the indexer.
     * @returns Adjacent indexed transactions, or an empty array on 404 / empty result.
     */
    async getAdjacentTransactions(transactionHash: string): Promise<ToncenterV3IndexedTransaction[]> {
        const endpoint = this.endpoint.endsWith('/') ? `${this.endpoint}adjacentTransactions` : `${this.endpoint}/adjacentTransactions`;
        const requestLabel = `GET ${endpoint}`;

        try {
            const response = await this.httpClient.get<TonAdjacentTransactionsResponse>(endpoint, {
                params: {
                    hash: transactionHash,
                },
                transformResponse: [toCamelCaseTransformer],
            });
            return response.data.transactions ?? [];
        } catch (error) {
            if ((error as { response?: { status?: number } }).response?.status === HTTP_NOT_FOUND_STATUS_CODE) {
                return [];
            }
            throw operationFetchError(`request ${requestLabel} failed to resolve adjacent TON indexed transactions`, error);
        }
    }

    /**
     * Traverses the linked chain of TON transactions in both directions starting from any TON transaction hash
     * from that linked transaction chain, and returns the transaction on crossChainLayer that the sequencer would collect
     * as a TVM event.
     * @param transactionHash Any TON transaction hash from the target linked chain of TON transactions.
     * @param crossChainLayerAddress crossChainLayer address whose sequencer-collected event transaction should be found in that linked chain of TON transactions.
     * @param params Optional traversal settings. Defaults match the SDK traversal defaults.
     * @returns Indexed crossChainLayer transaction that matches the sequencer collector rules, or null if not found.
     */
    async findCollectibleCrossChainLayerTransaction(
        transactionHash: string,
        crossChainLayerAddress: string,
        params?: ToncenterV3TraversalParams,
    ): Promise<ToncenterV3IndexedTransaction | null> {
        const {
            maxDepth = DEFAULT_FIND_TX_MAX_DEPTH,
            maxScannedTransactions = DEFAULT_MAX_SCANNED_TRANSACTIONS,
        } = params ?? {};
        const crossChainLayer = Address.parse(crossChainLayerAddress);
        const rootTransaction = await this.getTransactionByHash(transactionHash);
        if (!rootTransaction) {
            return null;
        }
        if (this.isCollectibleEventTransactionOnAccount(rootTransaction, crossChainLayer)) {
            return rootTransaction;
        }

        const queue = [{ hash: rootTransaction.hash, depth: 0 }];
        const visitedHashes = new Set<string>([rootTransaction.hash]);
        let scannedTransactions = 0;

        for (let i = 0; i < queue.length; i++) {
            const { hash: currentHash, depth } = queue[i];
            if (depth >= maxDepth || scannedTransactions >= maxScannedTransactions) {
                continue;
            }

            const adjacentTransactions = await this.getAdjacentTransactions(currentHash);
            for (const transaction of adjacentTransactions) {
                if (visitedHashes.has(transaction.hash)) {
                    continue;
                }
                visitedHashes.add(transaction.hash);
                scannedTransactions += 1;

                if (this.isCollectibleEventTransactionOnAccount(transaction, crossChainLayer)) {
                    return transaction;
                }

                if (scannedTransactions < maxScannedTransactions) {
                    queue.push({ hash: transaction.hash, depth: depth + 1 });
                }
            }
        }

        return null;
    }

    private isCollectibleEventTransactionOnAccount(transaction: ToncenterV3IndexedTransaction, account: Address): boolean {
        if (!Address.parse(transaction.account).equals(account)) {
            return false;
        }

        return transaction.outMsgs.some((message) => {
            return message.destination == null;
        });
    }
}
