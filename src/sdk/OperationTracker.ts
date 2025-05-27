import {
    Network,
    TransactionLinker,
    SimplifiedStatuses,
    OperationType,
    OperationIdsByShardsKey,
    ExecutionStages,
    ExecutionStagesByOperationId,
    StatusInfosByOperationId,
    StatusInfo,
} from '../structs/Struct';
import { mainnet, testnet } from '@tonappchain/artifacts';
import { LiteSequencerClient } from './LiteSequencerClient';

export class OperationTracker {
    private readonly clients: LiteSequencerClient[];

    constructor(network: Network, customLiteSequencerEndpoints?: string[]) {
        const endpoints =
            customLiteSequencerEndpoints ??
            (network === Network.TESTNET
                ? testnet.PUBLIC_LITE_SEQUENCER_ENDPOINTS
                : mainnet.PUBLIC_LITE_SEQUENCER_ENDPOINTS);

        this.clients = endpoints.map((endpoint) => new LiteSequencerClient(endpoint));
    }

    async getOperationType(operationId: string): Promise<OperationType> {
        for (const client of this.clients) {
            try {
                return await client.getOperationType(operationId);
            } catch (error) {
                console.error('Failed to get operationType:', error);
            }
        }
        throw new Error('All endpoints failed to get operation type');
    }

    async getOperationId(transactionLinker: TransactionLinker): Promise<string> {
        for (const client of this.clients) {
            try {
                return await client.getOperationId(transactionLinker);
            } catch (error) {
                console.error('Failed to get OperationId:', error);
            }
        }
        throw new Error('All endpoints failed to get operation id');
    }

    async getOperationIdsByShardsKeys(
        shardsKeys: string[],
        caller: string,
        chunkSize: number = 100,
    ): Promise<OperationIdsByShardsKey> {
        for (const client of this.clients) {
            try {
                return await client.getOperationIdsByShardsKeys(shardsKeys, caller, chunkSize);
            } catch (error) {
                console.error('Failed to get OperationIds:', error);
            }
        }
        throw new Error('All endpoints failed to get operation ids by shards keys');
    }

    async getStageProfiling(operationId: string): Promise<ExecutionStages> {
        for (const client of this.clients) {
            try {
                const map = await client.getStageProfilings([operationId]);
                const result = map[operationId];
                if (!result) {
                    throw new Error(`No stageProfiling data for operationId=${operationId}`);
                }
                return result;
            } catch (error) {
                console.error('Failed to get stage profiling:', error);
            }
        }
        throw new Error('All endpoints failed to get stage profiling');
    }

    async getStageProfilings(operationIds: string[], chunkSize: number = 100): Promise<ExecutionStagesByOperationId> {
        for (const client of this.clients) {
            try {
                return await client.getStageProfilings(operationIds, chunkSize);
            } catch (error) {
                console.error('Failed to get stage profilings:', error);
            }
        }
        throw new Error('All endpoints failed to get stage profilings');
    }

    async getOperationStatuses(operationIds: string[], chunkSize: number = 100): Promise<StatusInfosByOperationId> {
        for (const client of this.clients) {
            try {
                return await client.getOperationStatuses(operationIds, chunkSize);
            } catch (error) {
                console.error('Failed to get operation statuses:', error);
            }
        }
        throw new Error('All endpoints failed to get operation statuses');
    }

    async getOperationStatus(operationId: string): Promise<StatusInfo> {
        for (const client of this.clients) {
            try {
                const map = await client.getOperationStatuses([operationId]);
                const result = map[operationId];
                if (!result) {
                    throw new Error(`No operation status for operationId=${operationId}`);
                }
                return result;
            } catch (error) {
                console.error('Failed to get operation status:', error);
            }
        }
        throw new Error('All endpoints failed to get operation status');
    }

    async getSimplifiedOperationStatus(transactionLinker: TransactionLinker): Promise<SimplifiedStatuses> {
        const operationId = await this.getOperationId(transactionLinker);
        if (operationId == '') {
            return SimplifiedStatuses.OPERATION_ID_NOT_FOUND;
        }

        const operationType = await this.getOperationType(operationId);

        if (operationType == OperationType.PENDING || operationType == OperationType.UNKNOWN) {
            return SimplifiedStatuses.PENDING;
        }

        if (operationType == OperationType.ROLLBACK) {
            return SimplifiedStatuses.FAILED;
        }

        return SimplifiedStatuses.SUCCESSFUL;
    }
}
