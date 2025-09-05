import { Wallet } from 'ethers';

import type { SenderAbstraction } from '../sender';
import {
    CrossChainTransactionOptions,
    CrosschainTx,
    EvmProxyMsg,
    OperationIdsByShardsKey,
    TransactionLinkerWithOperationId,
    WaitOptions,
} from '../structs/Struct';
import { Asset } from './Asset';

export interface ITransactionManager {
    /**
     * Sends a single cross-chain transaction.
     * @param evmProxyMsg Encoded EVM proxy message to bridge.
     * @param sender Sender abstraction for TVM message sending.
     * @param assets Optional assets to attach to the cross-chain message.
     * @param options Optional cross-chain execution options (fees, executors, extra data).
     * @param waitOptions Optional policy to wait for operation id resolution.
     * @returns Transaction linker with operation id for tracking.
     */
    sendCrossChainTransaction(
        evmProxyMsg: EvmProxyMsg,
        sender: SenderAbstraction,
        assets?: Asset[],
        options?: CrossChainTransactionOptions,
        waitOptions?: WaitOptions<string>,
    ): Promise<TransactionLinkerWithOperationId>;

    /**
     * Sends multiple cross-chain transactions in a batch.
     * @param sender Sender abstraction for TVM message sending.
     * @param txs List of cross-chain transactions to broadcast.
     * @param waitOptions Optional policy for waiting on operation ids by shard keys.
     * @returns Array of transaction linkers, one per submitted transaction.
     */
    sendCrossChainTransactions(
        sender: SenderAbstraction,
        txs: CrosschainTx[],
        waitOptions?: WaitOptions<OperationIdsByShardsKey>,
    ): Promise<TransactionLinkerWithOperationId[]>;

    /**
     * Bridges native EVM value and optional assets to TON chain via executor.
     * @param signer Ethers Wallet used to sign EVM transaction.
     * @param value Amount of native EVM currency (wei as bigint).
     * @param tonTarget Recipient TVM address on TON.
     * @param assets Optional list of TAC assets to include.
     * @param tvmExecutorFee Optional explicit TON-side executor fee.
     * @param tvmValidExecutors Optional whitelist of allowed TVM executors.
     * @returns EVM transaction hash or bridge identifier.
     */
    bridgeTokensToTON(
        signer: Wallet,
        value: bigint,
        tonTarget: string,
        assets?: Asset[],
        tvmExecutorFee?: bigint,
        tvmValidExecutors?: string[],
    ): Promise<string>;
}
