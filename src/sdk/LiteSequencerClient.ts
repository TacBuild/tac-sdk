import {
    emptyArrayError,
    operationFetchError,
    profilingFetchError,
    statusFetchError,
} from '../errors';
import { convertCurrencyFetchError, getTONFeeInfoFetchError, simulationFetchError } from '../errors/instances';
import { IHttpClient, ILiteSequencerClient } from '../interfaces';
import {
    ConvertCurrencyResponse,
    OperationIdsByShardsKeyResponse,
    OperationTypeResponse,
    StageProfilingResponse,
    StatusesResponse,
    StringResponse,
    SuggestedTVMExecutorFeeResponse,
    TACSimulationResponse,
} from '../structs/InternalStruct';
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
import { AxiosHttpClient } from './AxiosHttpClient';
import { toCamelCaseTransformer } from './Utils';

export class LiteSequencerClient implements ILiteSequencerClient{
    private readonly endpoint: string;
    private readonly maxChunkSize: number;
    private readonly httpClient: IHttpClient;

    constructor(endpoint: string, maxChunkSize: number = 100, httpClient: IHttpClient = new AxiosHttpClient()) {
        this.endpoint = endpoint;
        this.maxChunkSize = maxChunkSize;
        this.httpClient = httpClient;
    }

    async getOperationIdByTransactionHash(transactionHash: string): Promise<string> {
        const isEthHash = /^0x[a-fA-F0-9]{64}$/.test(transactionHash);
        const path = isEthHash ? 'tac/operation-id' : 'ton/operation-id';

        try {
            const response = await this.httpClient.get<StringResponse>(new URL(path, this.endpoint).toString(), {
                params: { transactionHash },
            });
            return response.data.response || '';
        } catch (error) {
            if ((error as any)?.response?.status === 404) {
                return '';
            }
            throw operationFetchError(`endpoint ${this.endpoint} failed to complete request`, error);
        }
    }

    async getOperationType(operationId: string): Promise<OperationType> {
        try {
            const response = await this.httpClient.get<OperationTypeResponse>(
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
            const response = await this.httpClient.post<StringResponse>(
                new URL('ton/operation-id', this.endpoint).toString(),
                requestBody,
            );
            return response.data.response || '';
        } catch (error) {
            if ((error as any)?.response?.status === 404) {
                return '';
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
                    const response = await this.httpClient.post<OperationIdsByShardsKeyResponse>(
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
                    const response = await this.httpClient.post<StageProfilingResponse>(
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
                    const response = await this.httpClient.post<StatusesResponse>(
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

    async convertCurrency(params: ConvertCurrencyParams): Promise<ConvertedCurrencyResult> {
        try {
            const payload = {
                currency: params.currency,
                value: params.value.toString(),
            } as const;

            const response = await this.httpClient.post<ConvertCurrencyResponse>(
                new URL('convert_currency', this.endpoint).toString(),
                payload,
                {
                    transformResponse: [toCamelCaseTransformer],
                },
            );

            const raw = response.data.response;

            return {
                decimals: raw.decimals,
                spotValue: BigInt(raw.spotValue),
                emaValue: BigInt(raw.emaValue),
                currency: raw.currency,
                tacPrice: {
                    spot: BigInt(raw.tacPrice.spot),
                    ema: BigInt(raw.tacPrice.ema),
                    decimals: raw.tacPrice.decimals,
                },
                tonPrice: {
                    spot: BigInt(raw.tonPrice.spot),
                    ema: BigInt(raw.tonPrice.ema),
                    decimals: raw.tonPrice.decimals,
                },
            };
        } catch (error) {
            throw convertCurrencyFetchError(`endpoint ${this.endpoint} failed to complete request`, error);
        }
    }

    async simulateTACMessage(params: TACSimulationParams): Promise<TACSimulationResult> {
        try {
            const response = await this.httpClient.post<TACSimulationResponse>(
                new URL('tac/simulator/simulate-message', this.endpoint).toString(),
                params,
                {
                    transformResponse: [toCamelCaseTransformer],
                },
            );

            return response.data.response;
        } catch (error) {
            throw simulationFetchError(`endpoint ${this.endpoint} failed to complete request`, error);
        }
    }

    async getTVMExecutorFee(params: GetTVMExecutorFeeParams): Promise<SuggestedTVMExecutorFee> {
        try {
            const response = await this.httpClient.post<SuggestedTVMExecutorFeeResponse>(
                new URL('/ton/calculator/ton-executor-fee', this.endpoint).toString(),
                params,
                {
                    transformResponse: [toCamelCaseTransformer],
                },
            );

            return response.data.response;
        } catch (error) {
            throw getTONFeeInfoFetchError(`endpoint ${this.endpoint} failed to complete request`, error);
        }
    }

    private async processChunkedRequest<T>(
        identifiers: string[],
        requestFn: (chunk: string[]) => Promise<T>,
        chunkSize: number = this.maxChunkSize,
    ): Promise<T> {
        const results: T[] = [];

        for (let i = 0; i < identifiers.length; i += chunkSize) {
            const chunk = identifiers.slice(i, i + chunkSize);
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
