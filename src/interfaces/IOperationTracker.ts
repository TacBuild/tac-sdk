import {
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
    getOperationType(operationId: string, waitOptions?: WaitOptions<OperationType>): Promise<OperationType>;
    getOperationId(transactionLinker: TransactionLinker, waitOptions?: WaitOptions<string>): Promise<string>;
    getOperationIdByTransactionHash(transactionHash: string, waitOptions?: WaitOptions<string>): Promise<string>;
    getOperationIdsByShardsKeys(
        shardsKeys: string[],
        caller: string,
        waitOptions?: WaitOptions<OperationIdsByShardsKey>,
        chunkSize?: number,
    ): Promise<OperationIdsByShardsKey>;
    getStageProfiling(operationId: string, waitOptions?: WaitOptions<ExecutionStages>): Promise<ExecutionStages>;
    getStageProfilings(
        operationIds: string[],
        waitOptions?: WaitOptions<ExecutionStagesByOperationId>,
        chunkSize?: number,
    ): Promise<ExecutionStagesByOperationId>;
    getOperationStatuses(
        operationIds: string[],
        waitOptions?: WaitOptions<StatusInfosByOperationId>,
        chunkSize?: number,
    ): Promise<StatusInfosByOperationId>;
    getOperationStatus(operationId: string, waitOptions?: WaitOptions<StatusInfo>): Promise<StatusInfo>;
    getSimplifiedOperationStatus(transactionLinker: TransactionLinker): Promise<SimplifiedStatuses>;
}
