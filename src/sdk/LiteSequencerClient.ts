import axios from 'axios';

import { emptyArrayError, operationFetchError, profilingFetchError,statusFetchError } from '../errors';
import {
    OperationIdsByShardsKeyResponse,
    OperationTypeResponse,
    StageProfilingResponse,
    StatusesResponse,
    StringResponse,
} from '../structs/InternalStruct';
import {
    ExecutionStagesByOperationId,
    OperationIdsByShardsKey,
    OperationType,
    StatusInfosByOperationId,
    TransactionLinker,
} from '../structs/Struct';
import { toCamelCaseTransformer } from './Utils';

export class LiteSequencerClient {
    private readonly endpoint: string;
    private readonly maxChunkSize: number;

    constructor(endpoint: string, maxChunkSize: number = 100) {
        this.endpoint = endpoint;
        this.maxChunkSize = maxChunkSize;
    }

    async getOperationType(operationId: string): Promise<OperationType> {
        try {
            const response = await axios.get<OperationTypeResponse>(
                new URL('operation-type', this.endpoint).toString(),
                {
                    params: {
                        operationId,
                    },
                },
            );
            return response.data.response || '';
        } catch (error) {
            throw operationFetchError(`endpoint ${this.endpoint} failed to complete request`, error);
        }
    }

    async getOperationId(transactionLinker: TransactionLinker): Promise<string> {
        const requestBody = {
            shardsKey: transactionLinker.shardsKey,
            caller: transactionLinker.caller,
            shardCount: transactionLinker.shardCount,
            timestamp: transactionLinker.timestamp,
        };

        try {
            const response = await axios.post<StringResponse>(
                new URL('ton/operation-id', this.endpoint).toString(),
                requestBody,
            );
            return response.data.response || '';
        } catch (error) {
            if (axios.isAxiosError(error)) {
                if (error.response?.status === 404) {
                    return '';
                }
            }
            throw operationFetchError(`endpoint ${this.endpoint} failed to complete request`, error);
        }
    }

    async getOperationIdsByShardsKeys(
        shardsKeys: string[],
        caller: string,
        chunkSize: number = this.maxChunkSize,
    ): Promise<OperationIdsByShardsKey> {
        if (!shardsKeys || shardsKeys.length === 0) {
            throw emptyArrayError('shardsKeys');
        }

        try {
            const response = await this.processChunkedRequest<OperationIdsByShardsKeyResponse>(
                shardsKeys,
                async (chunk) => {
                    const response = await axios.post<OperationIdsByShardsKeyResponse>(
                        new URL('operation-ids-by-shards-keys', this.endpoint).toString(),
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
            throw operationFetchError(`endpoint ${this.endpoint} failed to complete request`, error);
        }
    }

    async getStageProfilings(
        operationIds: string[],
        chunkSize: number = this.maxChunkSize,
    ): Promise<ExecutionStagesByOperationId> {
        if (!operationIds || operationIds.length === 0) {
            throw emptyArrayError('operationIds');
        }

        try {
            const response = await this.processChunkedRequest<StageProfilingResponse>(
                operationIds,
                async (chunk) => {
                    const response = await axios.post<StageProfilingResponse>(
                        new URL('stage-profiling', this.endpoint).toString(),
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
            throw profilingFetchError(`endpoint ${this.endpoint} failed to complete request`, error);
        }
    }

    async getOperationStatuses(
        operationIds: string[],
        chunkSize: number = this.maxChunkSize,
    ): Promise<StatusInfosByOperationId> {
        if (!operationIds || operationIds.length === 0) {
            throw emptyArrayError('operationIds');
        }

        try {
            const response = await this.processChunkedRequest<StatusesResponse>(
                operationIds,
                async (chunk) => {
                    const response = await axios.post<StatusesResponse>(
                        new URL('status', this.endpoint).toString(),
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
            throw statusFetchError(`endpoint ${this.endpoint} failed to complete request`, error);
        }
    }

    private async processChunkedRequest<T>(
        identificators: string[],
        requestFn: (chunk: string[]) => Promise<T>,
        chunkSize: number = this.maxChunkSize,
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
}
