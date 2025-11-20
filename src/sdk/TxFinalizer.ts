import { Address, Transaction } from '@ton/ton';

import { ContractOpener, ILogger } from '../interfaces';
import { ITxFinalizer } from '../interfaces/ITxFinalizer';
import { TransactionDepth } from '../structs/InternalStruct';
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

    private logHashFormats(hash: string) {
        let hex, base64;

        if (hash.startsWith('0x')) {
            hex = hash;
            const cleanHex = hex.slice(2);
            const buffer = Buffer.from(cleanHex, 'hex');
            base64 = buffer.toString('base64');
        } else {
            base64 = hash;
            const buffer = Buffer.from(base64, 'base64');
            hex = '0x' + buffer.toString('hex');
        }

        return { hex: hex, base64: base64 };
    }

    // Fetches adjacent transactions from toncenter
    private async fetchAdjacentTransactions(
        address: Address,
        hash: string,
        retries = 5,
        delay = 1000,
    ): Promise<Transaction[]> {
        for (let i = retries; i >= 0; i--) {
            try {
                const txs = await this.contractOpener.getAdjacentTransactions(address, hash);
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
    public async trackTransactionTree(address: Address, hash: string, maxDepth: number = 10) {
        const visitedHashes = new Set<string>();
        const queue: TransactionDepth[] = [{ address, hash, depth: 0 }];

        while (queue.length > 0) {
            const { hash: currentHash, depth: currentDepth, address: currentAddress } = queue.shift()!;

            if (visitedHashes.has(currentHash)) {
                continue;
            }
            visitedHashes.add(currentHash);

            this.logger.debug(
                `Checking hash (depth ${currentDepth}):\nhex: ${this.logHashFormats(currentHash).hex}\nbase64: ${this.logHashFormats(currentHash).base64}`,
            );

            const transactions = await this.fetchAdjacentTransactions(currentAddress, currentHash);
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
                    this.logger.debug(
                        `Skipping hash (depth ${currentDepth}):\nhex: ${this.logHashFormats(tx.hash().toString('hex'))}\nbase64: ${this.logHashFormats(tx.hash().toString('base64'))}`,
                    );
                }
            }
        }
    }

    // async getTransactionByInMessage(inMessageBoc: string, client: ContractOpener): Promise<Transaction | undefined> {
    //     // Step 1. Convert Base64 BoC to Message if input is a string
    //     const inMessage = loadMessage(Cell.fromBase64(inMessageBoc).beginParse());

    //     // Step 2. Ensure the message is an external-in message
    //     if (inMessage.info.type !== 'external-in') {
    //         throw new Error(`Message must be "external-in", got ${inMessage.info.type}`);
    //     }
    //     const account = inMessage.info.dest;

    //     // Step 3. Compute the normalized hash of the input message
    //     const targetInMessageHash = getNormalizedExtMessageHash(inMessage);

    //     let lt: string | undefined = undefined;
    //     let hash: string | undefined = undefined;

    //     // Step 4. Paginate through the transaction history of the account
    //     while (true) {
    //         const transactions = await retry(
    //             () =>
    //                 client.getTransactions(account, {
    //                     hash,
    //                     lt,
    //                     limit: 10,
    //                     archival: true,
    //                 }),
    //             { delay: 1000, retries: 3 },
    //         );

    //         if (transactions.length === 0) {
    //             // No more transactions found - message may not be processed yet
    //             return undefined;
    //         }

    //         // Step 5. Search for a transaction whose input message matches the normalized hash
    //         for (const transaction of transactions) {
    //             if (transaction.inMessage?.info.type !== 'external-in') {
    //                 continue;
    //             }

    //             const inMessageHash = getNormalizedExtMessageHash(transaction.inMessage);
    //             if (inMessageHash == targetInMessageHash) {
    //                 return transaction;
    //             }
    //         }

    //         const last = transactions.at(-1)!;
    //         lt = last.lt.toString();
    //         hash = last.hash().toString('base64');
    //     }
    // }

    async waitForTransaction(
        target: string,
        targetInMessageHash: string,
        retries: number = 10,
        timeout: number = 1000,
    ): Promise<Transaction | undefined> {
        const account = Address.parse(target);

        this.logger.info(`Waiting for transaction ${targetInMessageHash} on account ${target}`);

        let attempt = 0;
        while (attempt < retries) {
            attempt++;
            this.logger.info(`Waiting for transaction to appear in network. Attempt: ${attempt}`);

            const transactions = await retry(
                () =>
                    this.contractOpener.getTransactions(account, {
                        limit: 10,
                        archival: true,
                    }),
                { delay: 1000, retries: 3 },
            );

            for (const transaction of transactions) {
                if (transaction.inMessage?.info.type !== 'external-in') {
                    continue;
                }

                const inMessageHash = getNormalizedExtMessageHash(transaction.inMessage);
                if (inMessageHash == targetInMessageHash) {
                    return transaction;
                }
            }

            await new Promise((resolve) => setTimeout(resolve, timeout));
        }

        // Transaction was not found - message may not be processed
        return undefined;
    }
}
