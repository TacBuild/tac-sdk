import { Transaction } from '@ton/ton';

export interface ITxFinalizer {
    trackTransactionTree(
        address: string,
        hash: string,
        params: { startLt: string; startHash: string; maxDepth?: number },
    ): Promise<void>;
    waitForTransaction(
        target: string,
        targetMessageBoc: string,
        params: {
            startLt?: string;
            startHash?: string;
            retries?: number;
            timeout?: number;
        },
    ): Promise<Transaction | undefined>;
}
