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
} from '../structs/Struct';
import { operationFetchError, statusFetchError, emptyArrayError, profilingFetchError } from '../errors';
import { toCamelCaseTransformer } from './Utils';
import { mainnet, testnet } from '@tonappchain/artifacts';
import { OperationIdsByShardsKeyResponse, StageProfilingResponse, StatusesResponse } from '../structs/InternalStruct';

export class OperationTracker {
    readonly TERMINATED_STATUS = 'TVMMerkleMessageExecuted';
    readonly BRIDGE_TERMINATED_STATUS = 'EVMMerkleMessageExecuted';

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

    async getOperationId(transactionLinker: TransactionLinker): Promise<string> {
        for (const endpoint of this.customLiteSequencerEndpoints) {
            try {
                const response = await axios.get(`${endpoint}/operation-id`, {
                    params: {
                        shardsKey: transactionLinker.shardsKey,
                        caller: transactionLinker.caller,
                        shardCount: transactionLinker.shardCount,
                        timestamp: transactionLinker.timestamp,
                    },
                });
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
        isBridgeOperation: boolean = false,
    ): Promise<SimplifiedStatuses> {
        const operationId = await this.getOperationId(transactionLinker);
        if (operationId == '') {
            return SimplifiedStatuses.OperationIdNotFound;
        }

        const status = await this.getOperationStatus(operationId);

        if (!status.success) {
            return SimplifiedStatuses.Failed;
        }

        const finalStatus = isBridgeOperation ? this.BRIDGE_TERMINATED_STATUS : this.TERMINATED_STATUS;
        if (status.stage == finalStatus) {
            return SimplifiedStatuses.Successful;
        }

        return SimplifiedStatuses.Pending;
    }
}
