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
import {
    OperationIdsByShardsKeyResponse,
    OperationTypeResponse,
    StageProfilingResponse,
    StatusesResponse,
    StringResponse,
} from '../structs/InternalStruct';

const DEFAULT_CHUNK_SIZE = 100;

export class OperationTracker {
    readonly network: Network;
    readonly customLiteSequencerEndpoints: string[];

    constructor(network: Network, customLiteSequencerEndpoints?: string[]) {
        this.network = network;

        this.customLiteSequencerEndpoints =
            customLiteSequencerEndpoints ??
            (this.network === Network.TESTNET
                ? testnet.PUBLIC_LITE_SEQUENCER_ENDPOINTS
                : mainnet.PUBLIC_LITE_SEQUENCER_ENDPOINTS);
    }

    async getOperationType(operationId: string): Promise<OperationType> {
        for (const endpoint of this.customLiteSequencerEndpoints) {
            try {
                const response = await axios.get<OperationTypeResponse>(`${endpoint}/operation-type`, {
                    params: {
                        operationId,
                    },
                });
                return response.data.response || '';
            } catch (error) {
                console.error(`Failed to get operationType with ${endpoint}:`, error);
            }
        }
        throw operationFetchError;
    }

    async getOperationId(transactionLinker: TransactionLinker): Promise<string> {
        const requestBody = {
            shardsKey: transactionLinker.shardsKey,
            caller: transactionLinker.caller,
            shardCount: transactionLinker.shardCount,
            timestamp: transactionLinker.timestamp,
        };

        let operationId: string | undefined = undefined;

        for (const endpoint of this.customLiteSequencerEndpoints) {
            try {
                const response = await axios.post<StringResponse>(`${endpoint}/ton/operation-id`, requestBody);
                return response.data.response || '';
            } catch (error) {
                if (axios.isAxiosError(error)) {
                    if (error.response?.status === 404) {
                        console.warn(`404 Not Found: ${endpoint}/ton/operation-id`);
                        operationId = '';
                        continue;
                    }
                }
                console.error(`Failed to get OperationId with ${endpoint}:`, error);
            }
        }

        if (operationId !== undefined) {
            return operationId;
        }
        throw operationFetchError;
    }

    async getOperationIdsByShardsKeys(
        shardsKeys: string[],
        caller: string,
        chunkSize: number = DEFAULT_CHUNK_SIZE,
    ): Promise<OperationIdsByShardsKey> {
        if (!shardsKeys || shardsKeys.length === 0) {
            throw emptyArrayError('shardsKeys');
        }

        for (const endpoint of this.customLiteSequencerEndpoints) {
            try {
                const response = await this.processChunkedRequest<OperationIdsByShardsKeyResponse>(
                    shardsKeys,
                    async (chunk) => {
                        const response = await axios.post<OperationIdsByShardsKeyResponse>(
                            `${endpoint}/operation-ids-by-shards-keys`,
                            {
                                shardsKeys: chunk,
                                caller: caller,
                            },
                        );
                        return response.data;
                    },
                    chunkSize,
                );

                return response.response;
            } catch (error) {
                console.error(`Failed to get OperationIds with ${endpoint}:`, error);
            }
        }

        throw operationFetchError;
    }

    private async processChunkedRequest<T>(
        identificators: string[],
        requestFn: (chunk: string[]) => Promise<T>,
        chunkSize: number = DEFAULT_CHUNK_SIZE,
    ): Promise<T> {
        const results: T[] = [];
        
        for (let i = 0; i < identificators.length; i += chunkSize) {
            const chunk = identificators.slice(i, i + chunkSize);
            const result = await requestFn(chunk);
            results.push(result);
        }

        // Combine results based on the type
        if (Array.isArray(results[0])) {
            return results.flat() as T;
        } else if (typeof results[0] === 'object') {
            return Object.assign({}, ...results) as T;
        }
        
        return results[0] as T;
    }

    async getStageProfiling(operationId: string): Promise<ExecutionStages> {
        const map = await this.getStageProfilings([operationId]);
        const result = map[operationId];
        if (!result) {
            throw new Error(`No stageProfiling data for operationId=${operationId}`);
        }
        return result;
    }

    async getStageProfilings(operationIds: string[], chunkSize: number = DEFAULT_CHUNK_SIZE): Promise<ExecutionStagesByOperationId> {
        if (!operationIds || operationIds.length === 0) {
            throw emptyArrayError('operationIds');
        }

        for (const endpoint of this.customLiteSequencerEndpoints) {
            try {
                const response = await this.processChunkedRequest<StageProfilingResponse>(
                    operationIds,
                    async (chunk) => {
                        const response = await axios.post<StageProfilingResponse>(
                            `${endpoint}/stage-profiling`,
                            {
                                operationIds: chunk,
                            },
                            {
                                transformResponse: [toCamelCaseTransformer],
                            },
                        );
                        return response.data;
                    },
                    chunkSize,
                );

                return response.response;
            } catch (error) {
                console.error(`Error fetching stage profiling with ${endpoint}:`, error);
            }
        }
        throw profilingFetchError('all endpoints failed to complete request');
    }

    async getOperationStatuses(operationIds: string[], chunkSize: number = DEFAULT_CHUNK_SIZE): Promise<StatusInfosByOperationId> {
        if (!operationIds || operationIds.length === 0) {
            throw emptyArrayError('operationIds');
        }

        for (const endpoint of this.customLiteSequencerEndpoints) {
            try {
                const response = await this.processChunkedRequest<StatusesResponse>(
                    operationIds,
                    async (chunk) => {
                        const response = await axios.post<StatusesResponse>(
                            `${endpoint}/status`,
                            {
                                operationIds: chunk,
                            },
                            {
                                transformResponse: [toCamelCaseTransformer],
                            },
                        );
                        return response.data;
                    },
                    chunkSize,
                );

                return response.response;
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
