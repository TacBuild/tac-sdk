import { Transaction } from '@ton/ton';

export interface ITxFinalizer {
    trackTransactionTree(address: string, hash: string, params: { maxDepth?: number }): Promise<void>;
    waitForTransaction(
        target: string,
        targetMessageBoc: string,
        params: {
            retries?: number;
            timeout?: number;
        },
    ): Promise<Transaction | undefined>;
}
