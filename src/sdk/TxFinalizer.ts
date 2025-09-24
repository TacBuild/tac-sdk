import { IHttpClient, ILogger } from '../interfaces';
import {
    AdjacentTransactionsResponse,
    ToncenterTransaction,
    TransactionDepth,
    TxFinalizerConfig,
} from '../structs/InternalStruct';
import { AxiosHttpClient } from './AxiosHttpClient';
import { NoopLogger } from './Logger';
import { sleep, toCamelCaseTransformer } from './Utils';

const IGNORE_OPCODE = [
    '0xd53276db', // Excess
    '0x7362d09c', // Jetton Notify
];

export class TonTxFinalizer {
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
                    continue;
                }

                // Log all errors except 404 Not Found
                if (!errorMessage.includes('404')) {
                    const logMessage = error instanceof Error ? error.message : error;
                    console.warn(`Failed to fetch adjacent transactions for ${hash}:`, logMessage);
                }
            }
            await sleep(delay);
        }
        return [];
    }

    // Checks if all transactions in the tree are successful
    public async trackTransactionTree(hash: string, maxDepth: number = 10) {
        const visitedHashes = new Set<string>();
        const queue: TransactionDepth[] = [{ hash, depth: 0 }];

        while (queue.length > 0) {
            const { hash: currentHash, depth: currentDepth } = queue.shift()!;

            if (visitedHashes.has(currentHash)) {
                continue;
            }
            visitedHashes.add(currentHash);

            this.logger.debug(
                `Checking hash (depth ${currentDepth}):\nhex: ${this.logHashFormats(currentHash).hex}\nbase64: ${this.logHashFormats(currentHash).base64}`,
            );

            const transactions = await this.fetchAdjacentTransactions(currentHash);
            if (transactions.length === 0) continue;

            for (const tx of transactions) {
                if (!IGNORE_OPCODE.includes(tx.inMsg.opcode) && tx.inMsg.opcode !== null) {
                    const { aborted, computePh: compute_ph, action } = tx.description;
                    if (
                        aborted ||
                        !compute_ph.success ||
                        !action.success ||
                        compute_ph.exitCode !== 0 ||
                        action.resultCode !== 0
                    ) {
                        throw new Error(
                            `Transaction failed:\n` +
                                `hash = ${currentHash}, ` +
                                `aborted = ${aborted}, ` +
                                `compute_ph.success = ${compute_ph.success}, ` +
                                `compute_ph.exit_code = ${compute_ph.exitCode}, ` +
                                `action.success = ${action.success}, ` +
                                `action.result_code = ${action.resultCode}`,
                        );
                    }
                    if (currentDepth + 1 < maxDepth) {
                        if (tx.outMsgs.length > 0) {
                            queue.push({ hash: tx.hash, depth: currentDepth + 1 });
                        }
                    }
                } else {
                    this.logger.debug(
                        `Skipping hash (depth ${currentDepth}):\nhex: ${this.logHashFormats(tx.hash).hex}\nbase64: ${this.logHashFormats(tx.hash).base64}`,
                    );
                }
            }
        }
    }
}
