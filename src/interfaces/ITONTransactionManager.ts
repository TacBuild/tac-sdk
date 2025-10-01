import type { SenderAbstraction } from '../sender';
import {
    BatchCrossChainTx,
    CrossChainTransactionsOptions,
    CrosschainTx,
    EvmProxyMsg,
    TransactionLinkerWithOperationId,
} from '../structs/Struct';

export interface ITONTransactionManager {
    /**
     * Sends a single cross-chain transaction.
     * @param evmProxyMsg Encoded EVM proxy message to bridge.
     * @param sender Sender abstraction for TVM message sending.
     * @param tx cross-chain transaction to bridge.
     * @returns Transaction linker with operation id for tracking.
     */
    sendCrossChainTransaction(
        evmProxyMsg: EvmProxyMsg,
        sender: SenderAbstraction,
        tx: CrosschainTx,
    ): Promise<TransactionLinkerWithOperationId>;

    /**
     * Sends multiple cross-chain transactions in a batch.
     * @param sender Sender abstraction for TVM message sending.
     * @param txs List of cross-chain transactions to bridge.
     * @param options Optional options controlling waiting behavior for operation ids.
     * @returns Array of transaction linkers, one per submitted transaction.
     */
    sendCrossChainTransactions(
        sender: SenderAbstraction,
        txs: BatchCrossChainTx[],
        options?: CrossChainTransactionsOptions,
    ): Promise<TransactionLinkerWithOperationId[]>;
}
