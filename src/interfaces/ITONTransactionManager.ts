import type { SenderAbstraction } from '../sender';
import {
    BatchCrossChainTx,
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

    /**
     * Builds the fee parameters for a cross-chain transaction.
     * @param options Transaction configuration options.
     * @param evmProxyMsg Encoded EVM proxy message.
     * @param sender Sender abstraction for TVM message sending.
     * @param tx Cross-chain transaction to bridge.
     * @returns Promise with the fee parameters.
     */
    buildFeeParams(
        options: CrossChainTransactionOptions,
        evmProxyMsg: EvmProxyMsg,
        sender: SenderAbstraction,
        tx: CrosschainTx,
    ): Promise<FeeParams>;

    /**
     * Prepares the transaction payloads required for a cross-chain operation without sending them.
     * @param evmProxyMsg Encoded EVM proxy message.
     * @param senderAddress TVM address of the transaction sender (wallet address).
     * @param assets Assets to be included in the transaction.
     * @param options Optional transaction configuration including error handling and executor settings.
     * @returns Promise with the prepared transaction payloads.
     */
    prepareCrossChainTransactionPayload(
        evmProxyMsg: EvmProxyMsg,
        senderAddress: string,
        assets: Asset[],
        options?: CrossChainTransactionOptions,
    ): Promise<CrossChainPayloadResult[]>;
}
