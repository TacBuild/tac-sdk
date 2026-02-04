import { Address, Transaction } from '@ton/ton';

import { txFinalizationError } from '../errors';
import { ContractOpener, IHttpClient, ILogger } from '../interfaces';
import { ITxFinalizer } from '../interfaces/ITxFinalizer';
import {
    AdjacentTransactionsResponse,
    GetTransactionsOptions,
    ToncenterTransaction,
    TransactionDepth,
    TxFinalizerConfig,
} from '../structs/InternalStruct';
import { TrackTransactionTreeParams } from '../structs/Struct';
import { AxiosHttpClient } from './AxiosHttpClient';
import { DEFAULT_FIND_TX_MAX_DEPTH, IGNORE_MSG_VALUE_1_NANO } from './Consts';
import { NoopLogger } from './Logger';
import { sleep, toCamelCaseTransformer } from './Utils';

const IGNORE_OPCODE = [
    0xd53276db, // Excess
];

export class TonTxFinalizer implements ITxFinalizer {
    private logger: ILogger;
    private contractOpener: ContractOpener;

    constructor(contractOpener: ContractOpener, logger: ILogger = new NoopLogger()) {
        this.contractOpener = contractOpener;
        this.logger = logger;
    }

    // Fetches adjacent transactions from toncenter
    private async fetchAdjacentTransactions(
        address: Address,
        hash: string,
        retries = 5,
        delay = 1000,
        opts?: GetTransactionsOptions,
    ): Promise<Transaction[]> {
        for (let i = retries; i >= 0; i--) {
            try {
                const txs = await this.contractOpener.getAdjacentTransactions(address, hash, opts);
                return txs;
            } catch (error) {
                const errorMessage = (error as Error).message;

                // Rate limit error (429) - retry
                if (errorMessage.includes('429')) {
                    if (i > 0) {
                        await sleep(delay);
                    }
                    continue;
                }

                // Log all errors except 404 Not Found
                if (!errorMessage.includes('404')) {
                    const logMessage = error instanceof Error ? error.message : error;
                    this.logger.warn(`Failed to fetch adjacent transactions for ${hash}:`, logMessage);
                }

                if (i > 0) {
                    await sleep(delay);
                }
            }
        }
        return [];
    }

    // Checks if all transactions in the tree are successful
    public async trackTransactionTree(
        address: string,
        hash: string,
        params: TrackTransactionTreeParams = { maxDepth: DEFAULT_FIND_TX_MAX_DEPTH, ignoreOpcodeList: IGNORE_OPCODE },
    ) {
        const { maxDepth = DEFAULT_FIND_TX_MAX_DEPTH, ignoreOpcodeList = IGNORE_OPCODE } = params;
        const parsedAddress = Address.parse(address);
        const visitedHashes = new Set<string>();
        const queue: TransactionDepth[] = [{ address: parsedAddress, hash, depth: 0 }];

        while (queue.length > 0) {
            const { hash: currentHash, depth: currentDepth, address: currentAddress } = queue.shift()!;

            if (visitedHashes.has(currentHash)) {
                continue;
            }
            visitedHashes.add(currentHash);

            this.logger.debug(`Checking hash (depth ${currentDepth}): ${currentHash}`);

            const transactions = await this.fetchAdjacentTransactions(currentAddress!, currentHash, 5, 1000, {
                limit: 10,
                archival: true,
            });
            this.logger.debug(`Found ${transactions.length} adjacent transactions for ${currentHash}`);

            if (transactions.length === 0) continue;

            for (const tx of transactions) {
                if (tx.description.type !== 'generic' || !tx.inMessage) continue;
                if (tx.inMessage.info.type === 'internal' && tx.inMessage.info.value.coins === IGNORE_MSG_VALUE_1_NANO)
                    continue; // we ignore messages with 1 nanoton value as they are for notification purpose only
                const bodySlice = tx.inMessage.body.beginParse();
                if (bodySlice.remainingBits < 32) continue;
                const opcode = bodySlice.loadUint(32);
                if (!ignoreOpcodeList.includes(opcode)) {
                    const { aborted, computePhase, actionPhase } = tx.description;
                    const failureCase = (() => {
                        if (aborted) {
                            return 'Transaction was aborted';
                        }
                        if (!computePhase) {
                            return 'computePhase not present';
                        }
                        if (computePhase.type === 'skipped') {
                            return 'computePhase was skipped';
                        }
                        if (!computePhase.success) {
                            return 'computePhase not successful';
                        }
                        if (computePhase.exitCode !== 0) {
                            return `computePhase.exitCode was not zero`;
                        }
                        if (actionPhase && !actionPhase.success) {
                            return 'actionPhase not successful';
                        }
                        if (actionPhase && actionPhase.resultCode !== 0) {
                            return `actionPhase.resultCode was not zero`;
                        }
                        return null;
                    })();

                    if (failureCase) {
                        const exitCode = computePhase && computePhase.type !== 'skipped' ? computePhase.exitCode : 'N/A';
                        const resultCode = actionPhase ? actionPhase.resultCode : 'N/A';
                        throw txFinalizationError(`${tx.hash().toString('base64')}: ${failureCase} (exitCode=${exitCode}, resultCode=${resultCode})`);
                    }
                    if (currentDepth + 1 < maxDepth) {
                        if (tx.outMessages.size > 0) {
                            queue.push({
                                hash: tx.hash().toString('base64'),
                                address: tx.inMessage.info.dest as Address,
                                depth: currentDepth + 1,
                            });
                        }
                    }
                } else {
                    this.logger.debug(`Skipping hash (depth ${currentDepth}): ${tx.hash().toString('base64')}`);
                }
            }

            this.logger.debug(`Finished checking hash (depth ${currentDepth}): ${currentHash}`);
        }
    }
}

export class TonIndexerTxFinalizer implements ITxFinalizer {
    private logger: ILogger;
    private apiConfig: TxFinalizerConfig;
    private readonly httpClient: IHttpClient;

    constructor(
        apiConfig: TxFinalizerConfig,
        logger: ILogger = new NoopLogger(),
        httpClient: IHttpClient = new AxiosHttpClient(),
    ) {
        this.apiConfig = apiConfig;
        this.logger = logger;
        this.httpClient = httpClient;
    }

    // Fetches adjacent transactions from toncenter
    private async fetchAdjacentTransactions(hash: string, retries = 5, delay = 1000): Promise<ToncenterTransaction[]> {
        for (let i = retries; i >= 0; i--) {
            try {
                const url = this.apiConfig.urlBuilder(hash);
                const response = await this.httpClient.get<AdjacentTransactionsResponse>(url, {
                    headers: {
                        [this.apiConfig.authorization.header]: this.apiConfig.authorization.value,
                    },
                    transformResponse: [toCamelCaseTransformer],
                });
                return response.data.transactions || [];
            } catch (error) {
                const errorMessage = (error as Error).message;

                // Rate limit error (429) - retry
                if (errorMessage.includes('429')) {
                    if (i > 0) {
                        await sleep(delay);
                    }
                    continue;
                }

                // Log all errors except 404 Not Found
                if (!errorMessage.includes('404')) {
                    const logMessage = error instanceof Error ? error.message : error;
                    this.logger.warn(`Failed to fetch adjacent transactions for ${hash}:`, logMessage);
                }

                if (i > 0) {
                    await sleep(delay);
                }
            }
        }
        return [];
    }

    // Checks if all transactions in the tree are successful
    public async trackTransactionTree(
        _: string,
        hash: string,
        params: TrackTransactionTreeParams = { maxDepth: DEFAULT_FIND_TX_MAX_DEPTH, ignoreOpcodeList: IGNORE_OPCODE },
    ) {
        const { maxDepth = DEFAULT_FIND_TX_MAX_DEPTH, ignoreOpcodeList = IGNORE_OPCODE } = params;
        const visitedHashes = new Set<string>();
        const queue: TransactionDepth[] = [{ hash, depth: 0 }];

        while (queue.length > 0) {
            const { hash: currentHash, depth: currentDepth } = queue.shift()!;

            if (visitedHashes.has(currentHash)) {
                continue;
            }
            visitedHashes.add(currentHash);

            this.logger.debug(`Checking hash (depth ${currentDepth}): ${currentHash}`);

            const transactions = await this.fetchAdjacentTransactions(currentHash);
            if (transactions.length === 0) continue;

            for (const tx of transactions) {
                if (tx.inMsg.value === IGNORE_MSG_VALUE_1_NANO.toString()) continue; // we ignore messages with 1 nanoton value as they are for notification purpose only
                if (!ignoreOpcodeList.includes(Number(tx.inMsg.opcode)) && tx.inMsg.opcode !== null) {
                    const { aborted, computePh, action } = tx.description;
                    const failureCase = (() => {
                        if (aborted) {
                            return 'Transaction was aborted';
                        }
                        if (!computePh) {
                            return 'computePh not present';
                        }
                        if (!computePh.success) {
                            return 'computePh not successful';
                        }
                        if (computePh.exitCode !== 0) {
                            return `computePh.exitCode was not zero`;
                        }
                        if (action && !action.success) {
                            return 'action not successful';
                        }
                        if (action && action.resultCode !== 0) {
                            return `action.resultCode was not zero`;
                        }
                        return null;
                    })();

                    if (failureCase) {
                        const exitCode = computePh ? computePh.exitCode : 'N/A';
                        const resultCode = action ? action.resultCode : 'N/A';
                        throw txFinalizationError(`${tx.hash}: ${failureCase} (exitCode=${exitCode}, resultCode=${resultCode})`);
                    }
                
                    if (currentDepth + 1 < maxDepth) {
                        if (tx.outMsgs.length > 0) {
                            queue.push({ hash: tx.hash, depth: currentDepth + 1 });
                        }
                    }
                } else {
                    this.logger.debug(`Skipping hash (depth ${currentDepth}): ${tx.hash}`);
                }
            }
        }
    }
}
