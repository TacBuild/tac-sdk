import { Address, Transaction } from '@ton/ton';

export interface ITxFinalizer {
    trackTransactionTree(address: Address, hash: string, maxDepth: number): Promise<void>;
    // getTransactionByInMessage(inMessageBoc: string, client: ContractOpener): Promise<Transaction | undefined>;
    waitForTransaction(
        target: string,
        targetInMessageHash: string,
        retries?: number,
        timeout?: number,
    ): Promise<Transaction | undefined>;
}
