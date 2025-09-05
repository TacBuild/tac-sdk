import {
    ConvertCurrencyParams,
    ConvertedCurrencyResult,
    ExecutionStages,
    ExecutionStagesByOperationId,
    OperationIdsByShardsKey,
    OperationType,
    SimplifiedStatuses,
    StatusInfo,
    StatusInfosByOperationId,
    TransactionLinker,
    WaitOptions,
} from '../structs/Struct';

export interface IOperationTracker {
    /**
     * Returns the operation type for the given id, optionally waiting according to the provided policy.
     * @param operationId Operation identifier.
     * @param waitOptions Optional waiting and polling settings.
     */
    getOperationType(operationId: string, waitOptions?: WaitOptions<OperationType>): Promise<OperationType>;
    /**
     * Resolves an operation id for the given transaction linker, optionally waiting until available.
     * @param transactionLinker Reference to originating transaction across chains.
     * @param waitOptions Optional waiting settings.
     */
    getOperationId(transactionLinker: TransactionLinker, waitOptions?: WaitOptions<string>): Promise<string>;
    /**
     * Resolves an operation id by a transaction hash, optionally waiting until available.
     * @param transactionHash Hash of the originating transaction.
     * @param waitOptions Optional waiting settings.
     */
    getOperationIdByTransactionHash(transactionHash: string, waitOptions?: WaitOptions<string>): Promise<string>;
    /**
     * Resolves operation ids by shard keys for a particular caller, with optional batching and waiting.
     * @param shardsKeys List of shard keys.
     * @param caller Human-readable identifier of the caller (for tracing/limits).
     * @param waitOptions Optional waiting settings.
     * @param chunkSize Optional batching size for network requests.
     */
    getOperationIdsByShardsKeys(
        shardsKeys: string[],
        caller: string,
        waitOptions?: WaitOptions<OperationIdsByShardsKey>,
        chunkSize?: number,
    ): Promise<OperationIdsByShardsKey>;
    /**
     * Gets detailed stage profiling for a single operation, optionally waiting until available.
     * @param operationId Operation identifier.
     * @param waitOptions Optional waiting settings.
     */
    getStageProfiling(operationId: string, waitOptions?: WaitOptions<ExecutionStages>): Promise<ExecutionStages>;
    /**
     * Gets stage profiling for multiple operations in bulk.
     * @param operationIds Operation identifiers.
     * @param waitOptions Optional waiting settings.
     * @param chunkSize Optional batching size for requests.
     */
    getStageProfilings(
        operationIds: string[],
        waitOptions?: WaitOptions<ExecutionStagesByOperationId>,
        chunkSize?: number,
    ): Promise<ExecutionStagesByOperationId>;
    /**
     * Gets statuses for multiple operations.
     * @param operationIds Operation identifiers.
     * @param waitOptions Optional waiting settings.
     * @param chunkSize Optional batching size for requests.
     */
    getOperationStatuses(
        operationIds: string[],
        waitOptions?: WaitOptions<StatusInfosByOperationId>,
        chunkSize?: number,
    ): Promise<StatusInfosByOperationId>;
    /**
     * Gets a single operation status, optionally waiting according to policy.
     * @param operationId Operation identifier.
     * @param waitOptions Optional waiting settings.
     */
    getOperationStatus(operationId: string, waitOptions?: WaitOptions<StatusInfo>): Promise<StatusInfo>;
    /**
     * Returns a simplified status for the provided transaction linker.
     * @param transactionLinker Reference to originating transaction across chains.
     */
    getSimplifiedOperationStatus(transactionLinker: TransactionLinker): Promise<SimplifiedStatuses>;
    /**
     * Converts currency using the tracker service, optionally waiting for completion.
     * @param params Conversion parameters.
     * @param waitOptions Optional waiting settings.
     */
    convertCurrency(
        params: ConvertCurrencyParams,
        waitOptions?: WaitOptions<ConvertedCurrencyResult>,
    ): Promise<ConvertedCurrencyResult>;
}
