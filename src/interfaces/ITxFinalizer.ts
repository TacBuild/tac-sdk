export interface ITxFinalizer {
    trackTransactionTree(address: string, hash: string, params: { maxDepth?: number }): Promise<void>;
}
