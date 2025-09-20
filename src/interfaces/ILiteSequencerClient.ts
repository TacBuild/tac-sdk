import {
    ConvertCurrencyParams,
    ConvertedCurrencyResult,
    ExecutionStagesByOperationId,
    GetTVMExecutorFeeParams,
    OperationIdsByShardsKey,
    OperationType,
    StatusInfosByOperationId,
    SuggestedTVMExecutorFee,
    TACSimulationParams,
    TACSimulationResult,
    TransactionLinker,
} from '../structs/Struct';

export interface ILiteSequencerClient {
    /** Retrieves the operation type by id. */
    getOperationType(operationId: string): Promise<OperationType>;
    /** Resolves operation id by a transaction linker. */
    getOperationId(transactionLinker: TransactionLinker): Promise<string>;
    /** Resolves operation id by the originating transaction hash. */
    getOperationIdByTransactionHash(transactionHash: string): Promise<string>;
    /**
     * Resolves operation ids for multiple shard keys.
     * @param shardsKeys Shard keys to query.
     * @param caller Human-readable identifier of the caller (for rate limiting/observability).
     * @param chunkSize Optional chunk size for batching requests.
     */
    getOperationIdsByShardsKeys(
        shardsKeys: string[],
        caller: string,
        chunkSize?: number,
    ): Promise<OperationIdsByShardsKey>;
    /**
     * Fetches stage profiling data for a set of operation ids.
     * @param operationIds Operation ids to get profiling for.
     * @param chunkSize Optional batching size.
     */
    getStageProfilings(operationIds: string[], chunkSize?: number): Promise<ExecutionStagesByOperationId>;
    /**
     * Fetches statuses for a set of operation ids.
     * @param operationIds Operation ids to get statuses for.
     * @param chunkSize Optional batching size.
     */
    getOperationStatuses(operationIds: string[], chunkSize?: number): Promise<StatusInfosByOperationId>;

    /** Converts currency amount using the sequencer-provided rate source. */
    convertCurrency(params: ConvertCurrencyParams): Promise<ConvertedCurrencyResult>;

    /**
     * Gets TVM executor fee information for cross-chain operations.
     * @param params Parameters for fee calculation including assets and fee symbol.
     * @returns Promise resolving to suggested TVM executor fee information.
     */
    getTVMExecutorFee(params: GetTVMExecutorFeeParams): Promise<SuggestedTVMExecutorFee>;

    /**
     * Simulates TAC message execution without broadcasting it on-chain.
     * Useful for estimating fees and validating transaction inputs.
     * @param params Simulation request with encoded message and context.
     * @returns Promise resolving to detailed simulation result.
     */
    simulateTACMessage(params: TACSimulationParams): Promise<TACSimulationResult>;
}
