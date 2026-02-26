import { mainnet, testnet } from '../../artifacts';
import { allEndpointsFailedError } from '../errors';
import { convertCurrencyNegativeOrZeroValueError } from '../errors/instances';
import { ILiteSequencerClient, ILiteSequencerClientFactory, ILogger, IOperationTracker } from '../interfaces';
import {
    ConvertCurrencyParams,
    ConvertedCurrencyResult,
    ExecutionStages,
    ExecutionStagesByOperationId,
    GetTVMExecutorFeeParams,
    Network,
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
import { LiteSequencerClient } from './LiteSequencerClient';
import { NoopLogger } from './Logger';
import { formatObjectForLogging, waitUntilSuccess } from './Utils';
import { Validator } from './Validator';

export class DefaultLiteSequencerClientFactory implements ILiteSequencerClientFactory {
    createClients(endpoints: string[]): ILiteSequencerClient[] {
        return endpoints.map((endpoint) => new LiteSequencerClient(endpoint));
    }
}

export class OperationTracker implements IOperationTracker {
    private readonly clients: ILiteSequencerClient[];
    private readonly logger: ILogger;

    constructor(
        network: Network,
        customLiteSequencerEndpoints?: string[],
        logger: ILogger = new NoopLogger(),
        clientFactory: ILiteSequencerClientFactory = new DefaultLiteSequencerClientFactory(),
    ) {
        let endpoints: string[];
        if (network === Network.DEV) {
            if (!customLiteSequencerEndpoints || customLiteSequencerEndpoints.length === 0) {
                throw new Error('For DEV network, custom lite sequencer endpoints must be provided');
            }
            endpoints = customLiteSequencerEndpoints;
        } else {
            const artifacts = network === Network.MAINNET ? mainnet : testnet;
            endpoints =
                customLiteSequencerEndpoints && customLiteSequencerEndpoints.length !== 0
                    ? customLiteSequencerEndpoints
                    : artifacts.PUBLIC_LITE_SEQUENCER_ENDPOINTS;
        }
        this.clients = clientFactory.createClients(endpoints);
        this.logger = logger;
    }

    async getOperationIdByTransactionHash(transactionHash: string, waitOptions?: WaitOptions<string> | null): Promise<string> {
        const requestFn = async (): Promise<string> => {
            let lastError: unknown;
            for (const client of this.clients) {
                try {
                    const id = await client.getOperationIdByTransactionHash(transactionHash);
                    return id;
                } catch (error) {
                    lastError = error;
                }
            }
            throw allEndpointsFailedError(lastError, waitOptions?.includeErrorTrace ?? false);
        };

        return waitOptions === null
            ? await requestFn()
            : await waitUntilSuccess(
                  { logger: this.logger, ...waitOptions },
                  requestFn,
                  `OperationTracker: Getting operation ID by transaction hash ${formatObjectForLogging(transactionHash)}`,
              );
    }

    async getOperationType(operationId: string, waitOptions?: WaitOptions<OperationType> | null): Promise<OperationType> {
        const requestFn = async (): Promise<OperationType> => {
            let lastError: unknown;
            for (const client of this.clients) {
                try {
                    const type = await client.getOperationType(operationId);
                    return type;
                } catch (error) {
                    lastError = error;
                }
            }
            throw allEndpointsFailedError(lastError, waitOptions?.includeErrorTrace ?? false);
        };

        return waitOptions === null
            ? await requestFn()
            : await waitUntilSuccess({ logger: this.logger, ...waitOptions }, requestFn, `OperationTracker: Getting operation type for ${formatObjectForLogging(operationId)}`);
    }

    async getOperationId(transactionLinker: TransactionLinker, waitOptions?: WaitOptions<string> | null): Promise<string> {
        const requestFn = async (): Promise<string> => {
            let lastError: unknown;
            for (const client of this.clients) {
                try {
                    const id = await client.getOperationId(transactionLinker);
                    return id;
                } catch (error) {
                    lastError = error;
                }
            }
            throw allEndpointsFailedError(lastError, waitOptions?.includeErrorTrace ?? false);
        };

        return waitOptions === null
            ? await requestFn()
            : await waitUntilSuccess(
                  { logger: this.logger, ...waitOptions },
                  requestFn,
                  `OperationTracker: Getting operation ID by transaction linker ${formatObjectForLogging(transactionLinker)}`,
              );
    }

    async getOperationIdsByShardsKeys(
        shardsKeys: string[],
        caller: string,
        waitOptions?: WaitOptions<OperationIdsByShardsKey> | null,
        chunkSize: number = 100,
    ): Promise<OperationIdsByShardsKey> {
        const requestFn = async (): Promise<OperationIdsByShardsKey> => {
            let lastError: unknown;

            for (const client of this.clients) {
                try {
                    const result = await client.getOperationIdsByShardsKeys(shardsKeys, caller, chunkSize);
                    return result;
                } catch (error) {
                    lastError = error;
                }
            }
            throw allEndpointsFailedError(lastError, waitOptions?.includeErrorTrace ?? false);
        };

        return waitOptions === null
            ? await requestFn()
            : await waitUntilSuccess({ logger: this.logger, ...waitOptions }, requestFn, `OperationTracker: Getting operation IDs by shards keys ${formatObjectForLogging(shardsKeys)} caller=${caller} chunkSize=${chunkSize}`);
    }

    async getStageProfiling(operationId: string, waitOptions?: WaitOptions<ExecutionStages> | null): Promise<ExecutionStages> {
        const requestFn = async (): Promise<ExecutionStages> => {
            let lastError: unknown;

            for (const client of this.clients) {
                try {
                    const map = await client.getStageProfilings([operationId]);
                    const result = map[operationId];
                    if (!result) {
                        throw new Error(`No stageProfiling data for operationId=${operationId}`);
                    }
                    return result;
                } catch (error) {
                    lastError = error;
                }
            }
            throw allEndpointsFailedError(lastError, waitOptions?.includeErrorTrace ?? false);
        };

        return waitOptions === null
            ? await requestFn()
            : await waitUntilSuccess({ logger: this.logger, ...waitOptions }, requestFn, `OperationTracker: Getting stage profiling for operation ${operationId}`);
    }

    async getStageProfilings(
        operationIds: string[],
        waitOptions?: WaitOptions<ExecutionStagesByOperationId> | null,
        chunkSize: number = 100,
    ): Promise<ExecutionStagesByOperationId> {
        const requestFn = async (): Promise<ExecutionStagesByOperationId> => {
            let lastError: unknown;
            for (const client of this.clients) {
                try {
                    const result = await client.getStageProfilings(operationIds, chunkSize);
                    return result;
                } catch (error) {
                    lastError = error;
                }
            }
            throw allEndpointsFailedError(lastError, waitOptions?.includeErrorTrace ?? false);
        };

        return waitOptions === null
            ? await requestFn()
            : await waitUntilSuccess({ logger: this.logger, ...waitOptions }, requestFn, `OperationTracker: Getting stage profilings for operations: ${operationIds.join(', ')} chunkSize=${chunkSize}`);
    }

    async getOperationStatuses(
        operationIds: string[],
        waitOptions?: WaitOptions<StatusInfosByOperationId> | null,
        chunkSize: number = 100,
    ): Promise<StatusInfosByOperationId> {
        const requestFn = async (): Promise<StatusInfosByOperationId> => {
            let lastError: unknown;
            for (const client of this.clients) {
                try {
                    const result = await client.getOperationStatuses(operationIds, chunkSize);
                    return result;
                } catch (error) {
                    lastError = error;
                }
            }
            throw allEndpointsFailedError(lastError, waitOptions?.includeErrorTrace ?? false);
        };

        return waitOptions === null
            ? await requestFn()
            : await waitUntilSuccess({ logger: this.logger, ...waitOptions }, requestFn, `OperationTracker: Getting operation statuses for operations: ${formatObjectForLogging(operationIds)} chunkSize=${chunkSize}`);
    }

    async getOperationStatus(operationId: string, waitOptions?: WaitOptions<StatusInfo> | null): Promise<StatusInfo> {
        const requestFn = async (): Promise<StatusInfo> => {
            let lastError: unknown;

            for (const client of this.clients) {
                try {
                    const map = await client.getOperationStatuses([operationId]);
                    const result = map[operationId];
                    if (!result) {
                        throw new Error(`No operation status for operationId=${operationId}`);
                    }
                    return result;
                } catch (error) {
                    lastError = error;
                }
            }
            throw allEndpointsFailedError(lastError, waitOptions?.includeErrorTrace ?? false);
        };

        const status = waitOptions === null
            ? await requestFn()
            : await waitUntilSuccess({ logger: this.logger, ...waitOptions }, requestFn, `OperationTracker: Getting operation status for ${formatObjectForLogging(operationId)}`);

        this.logger.debug(
            `operation status resolved stage=${status.stage ?? 'unknown'} success=${
                (String(status.success))
            }`,
        );
        return status;
    }

    async getSimplifiedOperationStatus(transactionLinker: TransactionLinker): Promise<SimplifiedStatuses> {
        const operationId = await this.getOperationId(transactionLinker);
        if (operationId == '') {
            this.logger.warn('Operation ID not found');
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

    async convertCurrency(
        params: ConvertCurrencyParams,
        waitOptions?: WaitOptions<ConvertedCurrencyResult> | null,
    ): Promise<ConvertedCurrencyResult> {
        if (params.value <= 0n) {
            throw convertCurrencyNegativeOrZeroValueError;
        }

        const requestFn = async (): Promise<ConvertedCurrencyResult> => {
            let lastError: unknown;
            for (const client of this.clients) {
                try {
                    const result = await client.convertCurrency(params);
                    return result;
                } catch (error) {
                    lastError = error;
                }
            }
            throw allEndpointsFailedError(lastError, waitOptions?.includeErrorTrace ?? false);
        };

        return waitOptions === null
            ? await requestFn()
            : await waitUntilSuccess({ logger: this.logger, ...waitOptions }, requestFn, `OperationTracker: Converting currency ${formatObjectForLogging(params)}`);
    }

    async simulateTACMessage(
        params: TACSimulationParams,
        waitOptions?: WaitOptions<TACSimulationResult> | null,
    ): Promise<TACSimulationResult> {
        Validator.validateTACSimulationParams(params);

        const requestFn = async (): Promise<TACSimulationResult> => {
            let lastError: unknown;
            for (const client of this.clients) {
                try {
                    const result = await client.simulateTACMessage(params);
                    return result;
                } catch (error) {
                    lastError = error;
                }
            }
            throw allEndpointsFailedError(lastError, waitOptions?.includeErrorTrace ?? false);
        };

        return waitOptions === null
            ? await requestFn()
            : await waitUntilSuccess({ logger: this.logger, ...waitOptions }, requestFn, `OperationTracker: Simulating TAC message ${formatObjectForLogging(params)}`);
    }

    async getTVMExecutorFee(
        params: GetTVMExecutorFeeParams,
        waitOptions?: WaitOptions<SuggestedTVMExecutorFee> | null,
    ): Promise<SuggestedTVMExecutorFee> {
        const requestFn = async (): Promise<SuggestedTVMExecutorFee> => {
            let lastError: unknown;
            for (const client of this.clients) {
                try {
                    const result = await client.getTVMExecutorFee(params);
                    return result;
                } catch (error) {
                    lastError = error;
                }
            }
            throw allEndpointsFailedError(lastError, waitOptions?.includeErrorTrace ?? false);
        };

        return waitOptions === null
            ? await requestFn()
            : await waitUntilSuccess({ logger: this.logger, ...waitOptions }, requestFn, `OperationTracker: Getting TVM executor fee ${formatObjectForLogging(params)}`);
    }
}
