import {
    ConvertCurrencyParams,
    ConvertedCurrencyResult,
    ExecutionStages,
    ExecutionStagesByOperationId,
    GetTVMExecutorFeeParams,
    OperationIdsByShardsKey,
    OperationType,
    SimplifiedStatuses,
    StatusInfo,
    StatusInfosByOperationId,
    SuggestedTVMExecutorFee,
    TACSimulationParams,
    TACSimulationResult,
    TransactionLinker,
    WaitOptions,
} from '../structs/Struct';

export interface IOperationTracker {
    /**
     * Returns the operation type for the given id, optionally waiting according to the provided policy.
     * @param operationId Operation identifier.
     * @param waitOptions Optional waiting and polling settings. Pass `null` to disable retries and use a single attempt.
     */
    getOperationType(operationId: string, waitOptions?: WaitOptions<OperationType> | null): Promise<OperationType>;
    /**
     * Resolves an operation id for the given transaction linker, optionally waiting until available.
     * @param transactionLinker Reference to originating transaction across chains.
     * @param waitOptions Optional waiting settings. Pass `null` to disable retries and use a single attempt.
     */
    getOperationId(transactionLinker: TransactionLinker, waitOptions?: WaitOptions<string> | null): Promise<string>;
    /**
     * Resolves an operation id by a transaction hash, optionally waiting until available.
     * @param transactionHash Hash of the originating transaction.
     * @param waitOptions Optional waiting settings. Pass `null` to disable retries and use a single attempt.
     */
    getOperationIdByTransactionHash(transactionHash: string, waitOptions?: WaitOptions<string> | null): Promise<string>;
    /**
     * Resolves operation ids by shard keys for a particular caller, with optional batching and waiting.
     * @param shardsKeys List of shard keys.
     * @param caller Human-readable identifier of the caller (for tracing/limits).
     * @param waitOptions Optional waiting settings. Pass `null` to disable retries and use a single attempt.
     * @param chunkSize Optional batching size for network requests.
     */
    getOperationIdsByShardsKeys(
        shardsKeys: string[],
        caller: string,
        waitOptions?: WaitOptions<OperationIdsByShardsKey> | null,
        chunkSize?: number,
    ): Promise<OperationIdsByShardsKey>;
    /**
     * Gets detailed stage profiling for a single operation, optionally waiting until available.
     * @param operationId Operation identifier.
     * @param waitOptions Optional waiting settings. Pass `null` to disable retries and use a single attempt.
     */
    getStageProfiling(operationId: string, waitOptions?: WaitOptions<ExecutionStages> | null): Promise<ExecutionStages>;
    /**
     * Gets stage profiling for multiple operations in bulk.
     * @param operationIds Operation identifiers.
     * @param waitOptions Optional waiting settings. Pass `null` to disable retries and use a single attempt.
     * @param chunkSize Optional batching size for requests.
     */
    getStageProfilings(
        operationIds: string[],
        waitOptions?: WaitOptions<ExecutionStagesByOperationId> | null,
        chunkSize?: number,
    ): Promise<ExecutionStagesByOperationId>;
    /**
     * Gets statuses for multiple operations.
     * @param operationIds Operation identifiers.
     * @param waitOptions Optional waiting settings. Pass `null` to disable retries and use a single attempt.
     * @param chunkSize Optional batching size for requests.
     */
    getOperationStatuses(
        operationIds: string[],
        waitOptions?: WaitOptions<StatusInfosByOperationId> | null,
        chunkSize?: number,
    ): Promise<StatusInfosByOperationId>;
    /**
     * Gets a single operation status, optionally waiting according to policy.
     * @param operationId Operation identifier.
     * @param waitOptions Optional waiting settings. Pass `null` to disable retries and use a single attempt.
     */
    getOperationStatus(operationId: string, waitOptions?: WaitOptions<StatusInfo> | null): Promise<StatusInfo>;
    /**
     * Returns a simplified status for the provided transaction linker.
     * @param transactionLinker Reference to originating transaction across chains.
     */
    getSimplifiedOperationStatus(transactionLinker: TransactionLinker): Promise<SimplifiedStatuses>;
    /**
     * Converts currency using the tracker service, optionally waiting for completion.
     * @param params Conversion parameters.
     * @param waitOptions Optional waiting settings. Pass `null` to disable retries and use a single attempt.
     */
    convertCurrency(
        params: ConvertCurrencyParams,
        waitOptions?: WaitOptions<ConvertedCurrencyResult> | null,
    ): Promise<ConvertedCurrencyResult>;

    /**
     * Simulates execution of a TAC message without broadcasting it, optionally waiting until the result is available.
     * Useful to validate inputs and estimate effects before sending a real transaction.
     * @param params Simulation parameters and context.
     * @param waitOptions Optional waiting settings (polling/timeout policy). Pass `null` to disable retries and use a single attempt.
     * @returns Promise with detailed simulation result.
     */
    simulateTACMessage(
        params: TACSimulationParams,
        waitOptions?: WaitOptions<TACSimulationResult> | null,
    ): Promise<TACSimulationResult>;

    /**
     * Suggests/calculates a TVM executor fee for the provided parameters, optionally waiting for completion.
     * @param params Parameters affecting fee calculation.
     * @param waitOptions Optional waiting settings (polling/timeout policy). Pass `null` to disable retries and use a single attempt.
     * @returns Promise with suggested fee information.
     */
    getTVMExecutorFee(
        params: GetTVMExecutorFeeParams,
        waitOptions?: WaitOptions<SuggestedTVMExecutorFee> | null,
    ): Promise<SuggestedTVMExecutorFee>;
}
