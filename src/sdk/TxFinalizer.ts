import { Address, Cell, loadMessage, Transaction } from '@ton/ton';

import { ContractOpener, ILogger } from '../interfaces';
import { ITxFinalizer } from '../interfaces/ITxFinalizer';
import { GetTransactionsOptions, TransactionDepth } from '../structs/InternalStruct';
import { NoopLogger } from './Logger';
import { getNormalizedExtMessageHash, retry, sleep } from './Utils';

const IGNORE_OPCODE = [
    0xd53276db, // Excess
    0x7362d09c, // Jetton Notify
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
    public async trackTransactionTree(address: string, hash: string, params: { maxDepth?: number }) {
        const { maxDepth = 10 } = params;
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

            const transactions = await this.fetchAdjacentTransactions(currentAddress, currentHash, 5, 1000, {
                limit: 10,
                archival: true,
            });
            console.log(`Found ${transactions.length} adjacent transactions for ${currentHash}`);

            if (transactions.length === 0) continue;

            for (const tx of transactions) {
                if (tx.description.type !== 'generic' || !tx.inMessage) continue;
                const bodySlice = tx.inMessage.body.beginParse();
                if (bodySlice.remainingBits < 32) continue;
                const opcode = bodySlice.loadUint(32);
                if (!IGNORE_OPCODE.includes(opcode)) {
                    const { aborted, computePhase, actionPhase } = tx.description;
                    if (
                        aborted ||
                        computePhase.type == 'skipped' ||
                        !computePhase.success ||
                        computePhase.exitCode !== 0 ||
                        (actionPhase && (!actionPhase.success || actionPhase.resultCode !== 0))
                    ) {
                        throw new Error(
                            `Transaction failed:\n` +
                                `hash = ${currentHash}, ` +
                                `aborted = ${aborted}, ` +
                                `compute phase: ${computePhase.type === 'skipped' ? 'skipped' : `success = ${computePhase.success}, exit code = ${computePhase.exitCode}`}, ` +
                                `action phase: ${!actionPhase ? 'skipped' : `success = ${actionPhase.success}, result code = ${actionPhase.resultCode}`} `,
                        );
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

    /**
     * Wait for a transaction by external message hash
     * @param target Target account address (string)
     * @param targetInMessageHash Normalized external message hash (base64)
     * @param retries Maximum number of retry attempts
     * @param timeout Delay between retry attempts in milliseconds
     * @returns The transaction if found, undefined otherwise
     */
    async waitForTransaction(
        target: string,
        targetMessageBoc: string,
        params: {
            retries?: number;
            timeout?: number;
        },
    ): Promise<Transaction | undefined> {
        const account = Address.parse(target);
        const { retries = 10, timeout = 1000 } = params;

        this.logger.info(`Waiting for transaction on account ${target}`);

        let attempt = 0;
        while (attempt < retries) {
            attempt++;
            this.logger.info(`Waiting for transaction to appear in network. Attempt: ${attempt}`);

            const transaction = await retry(
                async () => {
                    const hash = getNormalizedExtMessageHash(
                        loadMessage(Cell.fromBase64(targetMessageBoc).beginParse()),
                    );
                    const transaction = await this.contractOpener.getTransactionByHash(account, hash, {
                        limit: 100,
                    });
                    return transaction;
                },
                { delay: 1000, retries: 3 },
            );

            if (transaction) {
                return transaction;
            }

            await new Promise((resolve) => setTimeout(resolve, timeout));
        }

        // Transaction was not found - message may not be processed
        return undefined;
    }
}
