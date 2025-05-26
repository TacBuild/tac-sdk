import axios from 'axios';
import {
    TransactionLinker,
    StatusInfosByOperationId,
    OperationIdsByShardsKey,
    ExecutionStagesByOperationId,
    OperationType,
} from '../structs/Struct';
import { operationFetchError, statusFetchError, emptyArrayError, profilingFetchError } from '../errors';
import { toCamelCaseTransformer } from './Utils';
import {
    OperationIdsByShardsKeyResponse,
    OperationTypeResponse,
    StageProfilingResponse,
    StatusesResponse,
    StringResponse,
} from '../structs/InternalStruct';

export class LiteSequencerClient {
    private readonly endpoint: string;
    private readonly maxChunkSize: number;

    constructor(endpoint: string, maxChunkSize: number = 100) {
        this.endpoint = endpoint;
        this.maxChunkSize = maxChunkSize;
    }

    async getOperationType(operationId: string): Promise<OperationType> {
        try {
            const response = await axios.get<OperationTypeResponse>(`${this.endpoint}/operation-type`, {
                params: {
                    operationId,
                },
            });
            return response.data.response || '';
        } catch (error) {
            console.error(`Failed to get operationType with ${this.endpoint}:`, error);
            throw operationFetchError;
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
            const response = await axios.post<StringResponse>(`${this.endpoint}/ton/operation-id`, requestBody);
            return response.data.response || '';
        } catch (error) {
            if (axios.isAxiosError(error)) {
                if (error.response?.status === 404) {
                    console.warn(`404 Not Found: ${this.endpoint}/ton/operation-id`);
                    return '';
                }
            }
            console.error(`Failed to get OperationId with ${this.endpoint}:`, error);
            throw operationFetchError;
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
                        `${this.endpoint}/operation-ids-by-shards-keys`,
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
            console.error(`Failed to get OperationIds with ${this.endpoint}:`, error);
            throw operationFetchError;
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
                        `${this.endpoint}/stage-profiling`,
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
            console.error(`Error fetching stage profiling with ${this.endpoint}:`, error);
            throw profilingFetchError('endpoint failed to complete request');
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
                        `${this.endpoint}/status`,
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
            console.error(`Error fetching status transaction with ${this.endpoint}:`, error);
            throw statusFetchError('endpoint failed to complete request');
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
