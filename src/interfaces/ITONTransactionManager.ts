import type { SenderAbstraction } from '../sender';
import {
    CrosschainTx,
    EvmProxyMsg,
    OperationIdsByShardsKey,
    TransactionLinkerWithOperationId,
    WaitOptions,
} from '../structs/Struct';

export interface ITONTransactionManager {
    /**
     * Sends a single cross-chain transaction.
     * @param evmProxyMsg Encoded EVM proxy message to bridge.
     * @param sender Sender abstraction for TVM message sending.
     * @param tx cross-chain transaction to bridge.
     * @param waitOptions Optional policy to wait for operation id resolution.
     * @returns Transaction linker with operation id for tracking.
     */
    sendCrossChainTransaction(
        evmProxyMsg: EvmProxyMsg,
        sender: SenderAbstraction,
        tx: CrosschainTx,
        waitOptions?: WaitOptions<string>,
    ): Promise<TransactionLinkerWithOperationId>;

    /**
     * Sends multiple cross-chain transactions in a batch.
     * @param sender Sender abstraction for TVM message sending.
     * @param txs List of cross-chain transactions to bridge.
     * @param waitOptions Optional policy for waiting on operation ids by shard keys.
     * @returns Array of transaction linkers, one per submitted transaction.
     */
    sendCrossChainTransactions(
        sender: SenderAbstraction,
        txs: CrosschainTx[],
        waitOptions?: WaitOptions<OperationIdsByShardsKey>,
    ): Promise<TransactionLinkerWithOperationId[]>;

}
