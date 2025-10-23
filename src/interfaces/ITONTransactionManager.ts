import type { SenderAbstraction } from '../sender';
import {
    BatchCrossChainTx,
    CrossChainEstimationResult,
    CrossChainPayloadResult,
    CrossChainTransactionOptions,
    CrossChainTransactionsOptions,
    CrosschainTx,
    EvmProxyMsg,
    FeeParams,
    TransactionLinkerWithOperationId,
} from '../structs/Struct';
import { Asset } from './Asset';

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

    buildFeeParams(
        options: CrossChainTransactionOptions,
        evmProxyMsg: EvmProxyMsg,
        sender: SenderAbstraction,
        tx: CrosschainTx,
    ): Promise<FeeParams>;

    estimateCrossChainTransaction(
        evmProxyMsg: EvmProxyMsg,
        assets: Asset[],
        options?: CrossChainTransactionOptions,
    ): Promise<CrossChainEstimationResult>;

    prepareCrossChainTransactionPayload(
        evmProxyMsg: EvmProxyMsg,
        senderAddress: string,
        assets: Asset[],
        options?: CrossChainTransactionOptions,
    ): Promise<CrossChainPayloadResult[]>;
}
