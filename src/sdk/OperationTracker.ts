import axios from 'axios';

import {
    Network,
    TransactionLinker,
    SimplifiedStatuses,
    StatusInfosByOperationId,
    StatusInfo,
    OperationIdsByShardsKey,
    ExecutionStages,
    ExecutionStagesByOperationId,
    OperationType,
} from '../structs/Struct';
import { operationFetchError, statusFetchError, emptyArrayError, profilingFetchError } from '../errors';
import { toCamelCaseTransformer } from './Utils';
import { mainnet, testnet } from '@tonappchain/artifacts';
import { OperationIdsByShardsKeyResponse, OperationTypeResponse, StageProfilingResponse, StatusesResponse, StringResponse } from '../structs/InternalStruct';

export class OperationTracker {
    readonly TERMINATED_STATUS = 'executedInTON';
    readonly BRIDGE_TERMINATED_STATUS = 'executedInTAC';

    readonly network: Network;
    readonly customLiteSequencerEndpoints: string[];

    constructor(network: Network, customLiteSequencerEndpoints?: string[]) {
        this.network = network;

        this.customLiteSequencerEndpoints =
            customLiteSequencerEndpoints ??
            (this.network === Network.Testnet
                ? testnet.PUBLIC_LITE_SEQUENCER_ENDPOINTS
                : mainnet.PUBLIC_LITE_SEQUENCER_ENDPOINTS);
    }

    async getOperationType(operationId: string): Promise<OperationType> {
        for (const endpoint of this.customLiteSequencerEndpoints) {
            try {
                const response = await axios.get<OperationTypeResponse>(`${endpoint}/operation-type`, {
                    params: {
                        operationId
                    }
                });
                return response.data.response || '';
            } catch (error) {
                console.error(`Failed to get operationType with ${endpoint}:`, error);
            }
        }
        throw operationFetchError;
    }

    async getOperationId(transactionLinker: TransactionLinker): Promise<string> {
        for (const endpoint of this.customLiteSequencerEndpoints) {
            try {
                const requestBody = {
                    shardsKey: transactionLinker.shardsKey,
                    caller: transactionLinker.caller,
                    shardCount: transactionLinker.shardCount,
                    timestamp: transactionLinker.timestamp
                };

                const response = await axios.post<StringResponse>(
                    `${endpoint}/ton/operation-id`, 
                    requestBody,
                );
                return response.data.response || '';
            } catch (error) {
                console.error(`Failed to get OperationId with ${endpoint}:`, error);
            }
        }
        throw operationFetchError;
    }

    async getOperationIdsByShardsKeys(shardsKeys: string[], caller: string): Promise<OperationIdsByShardsKey> {
        const requestBody = {
            shardsKeys: shardsKeys,
            caller: caller,
        };

        for (const endpoint of this.customLiteSequencerEndpoints) {
            try {
                const response = await axios.post<OperationIdsByShardsKeyResponse>(
                    `${endpoint}/operation-ids-by-shards-keys`,
                    requestBody,
                );

                return response.data.response;
            } catch (error) {
                console.error(`Failed to get OperationIds with ${endpoint}:`, error);
            }
        }

        throw operationFetchError;
    }

    async getStageProfiling(operationId: string): Promise<ExecutionStages> {
        const map = await this.getStageProfilings([operationId]);
        const result = map[operationId];
        if (!result) {
            throw new Error(`No stageProfiling data for operationId=${operationId}`);
        }
        return result;
    }

    async getStageProfilings(operationIds: string[]): Promise<ExecutionStagesByOperationId> {
        if (!operationIds || operationIds.length === 0) {
            throw emptyArrayError('operationIds');
        }

        for (const endpoint of this.customLiteSequencerEndpoints) {
            try {
                const response = await axios.post<StageProfilingResponse>(
                    `${endpoint}/stage-profiling`,
                    {
                        operationIds,
                    },
                    {
                        transformResponse: [toCamelCaseTransformer],
                    },
                );

                return response.data.response;
            } catch (error) {
                console.error(`Error fetching status transaction with ${endpoint}:`, error);
            }
        }
        throw profilingFetchError('all endpoints failed to complete request');
    }

    async getOperationStatuses(operationIds: string[]): Promise<StatusInfosByOperationId> {
        if (!operationIds || operationIds.length === 0) {
            throw emptyArrayError('operationIds');
        }

        for (const endpoint of this.customLiteSequencerEndpoints) {
            try {
                const response = await axios.post<StatusesResponse>(
                    `${endpoint}/status`,
                    {
                        operationIds,
                    },
                    {
                        transformResponse: [toCamelCaseTransformer],
                    },
                );

                return response.data.response;
            } catch (error) {
                console.error(`Error fetching status transaction with ${endpoint}:`, error);
            }
        }
        throw statusFetchError('all endpoints failed to complete request');
    }

    async getOperationStatus(operationId: string): Promise<StatusInfo> {
        const result = await this.getOperationStatuses([operationId]);
        const currentStatus = result[operationId];
        if (!currentStatus) {
            throw statusFetchError('operation is not found in response');
        }

        return currentStatus;
    }

    async getSimplifiedOperationStatus(
        transactionLinker: TransactionLinker,
    ): Promise<SimplifiedStatuses> {
        const operationId = await this.getOperationId(transactionLinker);
        if (operationId == '') {
            return SimplifiedStatuses.OperationIdNotFound;
        }

        const operationType = await this.getOperationType(operationId);

        if (operationType == OperationType.PENDING || operationType == OperationType.UNKNOWN) {
            return SimplifiedStatuses.Pending
        }

        if (operationType == OperationType.ROLLBACK) {
            return SimplifiedStatuses.Failed;
        }

        return SimplifiedStatuses.Successful;
    }
}
