import type { SenderAbstraction } from '../sender';
import {
    CrosschainTx,
    EvmProxyMsg,
    ExecutionFeeEstimationResult,
    SuggestedTONExecutorFee,
    TACSimulationRequest,
    TACSimulationResult,
    TransactionLinker,
} from '../structs/Struct';
import { Asset } from './Asset';

export interface ISimulator {
    /**
     * Simulates a TAC message execution without sending it to the chain.
     * @param req Simulation request that encapsulates the message and context.
     * @returns Promise with detailed simulation output.
     */
    simulateTACMessage(req: TACSimulationRequest): Promise<TACSimulationResult>;
    /**
     * Simulates a list of cross-chain transactions for a given sender.
     * @param sender Sender abstraction used to provide context (e.g., wallet state).
     * @param txs Cross-chain transactions to simulate.
     * @returns Promise with results, one for each input transaction.
     */
    simulateTransactions(sender: SenderAbstraction, txs: CrosschainTx[]): Promise<TACSimulationResult[]>;
    /**
     * Suggests the TON executor fee for a given set of assets and target fee symbol.
     * @param assets Assets involved in execution.
     * @param feeSymbol Symbol that represents the fee denomination (e.g., TON).
     * @param tvmValidExecutors Whitelist of permitted TVM executors (optional).
     * @returns Promise with suggested fee information.
     */
    getTVMExecutorFeeInfo(
        assets: Asset[],
        feeSymbol: string,
        tvmValidExecutors?: string[],
    ): Promise<SuggestedTONExecutorFee>;
    /**
     * Computes simulation info and fees for a single transaction, using the provided sender context.
     * @param evmProxyMsg Encoded EVM proxy message.
     * @param sender Sender abstraction.
     * @param assets Optional list of assets to attach to the transaction.
     * @returns Promise with execution fee estimation details.
     */
    getTransactionSimulationInfo(
        evmProxyMsg: EvmProxyMsg,
        sender: SenderAbstraction,
        assets?: Asset[],
    ): Promise<ExecutionFeeEstimationResult>;
    /**
     * Computes simulation info for a transaction tied to an existing TransactionLinker.
     * @param evmProxyMsg Encoded EVM proxy message.
     * @param transactionLinker Linker referencing the originating transaction.
     * @param assets Assets to be included in the transaction.
     * @param allowSimulationError If true, returns partial info even if simulation fails.
     * @param isRoundTrip If true, includes round-trip (rollback) considerations.
     * @param evmValidExecutors Optional whitelist of EVM-side executors.
     * @param tvmValidExecutors Optional whitelist of TVM-side executors.
     * @param calculateRollbackFee If true, includes rollback fee in estimation.
     * @returns Promise with fee estimation and execution info.
     */
    getSimulationInfoForTransaction(
        evmProxyMsg: EvmProxyMsg,
        transactionLinker: TransactionLinker,
        assets: Asset[],
        allowSimulationError?: boolean,
        isRoundTrip?: boolean,
        evmValidExecutors?: string[],
        tvmValidExecutors?: string[],
        calculateRollbackFee?: boolean,
    ): Promise<ExecutionFeeEstimationResult>;
}
