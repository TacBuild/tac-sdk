import { mainnet, testnet } from '../../artifacts';

import { allEndpointsFailedError } from '../errors';
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
            endpoints = customLiteSequencerEndpoints && customLiteSequencerEndpoints.length !== 0 ?
                customLiteSequencerEndpoints :
                artifacts.PUBLIC_LITE_SEQUENCER_ENDPOINTS;
        }
        this.clients = clientFactory.createClients(endpoints);
        this.logger = logger;
    }

    async getOperationIdByTransactionHash(transactionHash: string, waitOptions?: WaitOptions<string>): Promise<string> {
        this.logger.debug(`Getting operation ID for transactionHash: ${formatObjectForLogging(transactionHash)}`);

        const requestFn = async (): Promise<string> => {
            let lastError: unknown;
            for (const client of this.clients) {
                try {
                    const id = await client.getOperationIdByTransactionHash(transactionHash);
                    this.logger.debug(`Operation ID ${id == '' ? 'does not exist' : 'retrieved successfully'}`);
                    return id;
                } catch (error) {
                    this.logger.warn(`Failed to get OperationId by transactionHash using one of the endpoints`);
                    lastError = error;
                }
            }
            this.logger.error('All endpoints failed to get operation id by transactionHash');
            throw allEndpointsFailedError(lastError);
        };

        return waitOptions ? await waitUntilSuccess(waitOptions, requestFn, "OperationTracker: Getting operation ID by transaction hash") : await requestFn();
    }

    async getOperationType(operationId: string, waitOptions?: WaitOptions<OperationType>): Promise<OperationType> {
        this.logger.debug(`Getting operation type for ${formatObjectForLogging(operationId)}`);

        const requestFn = async (): Promise<OperationType> => {
            let lastError: unknown;
            for (const client of this.clients) {
                try {
                    const type = await client.getOperationType(operationId);
                    this.logger.debug(`Operation retrieved successfully`);
                    return type;
                } catch (error) {
                    this.logger.warn(`Failed to get operationType using one of the endpoints`);
                    lastError = error;
                }
            }
            this.logger.error('All endpoints failed to get operation type');
            throw allEndpointsFailedError(lastError);
        };

        return waitOptions ? await waitUntilSuccess(waitOptions, requestFn, "OperationTracker: Getting operation type") : await requestFn();
    }

    async getOperationId(transactionLinker: TransactionLinker, waitOptions?: WaitOptions<string>): Promise<string> {
        this.logger.debug(`Getting operation ID for transaction linker: ${formatObjectForLogging(transactionLinker)}`);

        const requestFn = async (): Promise<string> => {
            let lastError: unknown;
            for (const client of this.clients) {
                try {
                    const id = await client.getOperationId(transactionLinker);
                    this.logger.debug(`Operation ID ${id == '' ? 'does not exist' : 'retrieved successfully'}`);
                    return id;
                } catch (error) {
                    this.logger.warn(`Failed to get OperationId using one of the endpoints`);
                    lastError = error;
                }
            }
            this.logger.error('All endpoints failed to get operation id');
            throw allEndpointsFailedError(lastError);
        };

        return waitOptions ? await waitUntilSuccess(waitOptions, requestFn, "OperationTracker: Getting operation ID by transaction linker") : await requestFn();
    }

    async getOperationIdsByShardsKeys(
        shardsKeys: string[],
        caller: string,
        waitOptions?: WaitOptions<OperationIdsByShardsKey>,
        chunkSize: number = 100,
    ): Promise<OperationIdsByShardsKey> {
        this.logger.debug(`Getting operation IDs for shards keys: ${formatObjectForLogging(shardsKeys)}`);
        this.logger.debug(`Caller: ${caller}, Chunk size: ${chunkSize}`);
        const requestFn = async (): Promise<OperationIdsByShardsKey> => {
            let lastError: unknown;

            for (const client of this.clients) {
                try {
                    const result = await client.getOperationIdsByShardsKeys(shardsKeys, caller, chunkSize);
                    this.logger.debug(`Operation IDs by shards keys retrieved successfully`);
                    return result;
                } catch (error) {
                    this.logger.warn(`Failed to get OperationIds using one of the endpoints`);
                    lastError = error;
                }
            }
            this.logger.error('All endpoints failed to get operation ids by shards keys');
            throw allEndpointsFailedError(lastError);
        };

        return waitOptions ? await waitUntilSuccess(waitOptions, requestFn, "OperationTracker: Getting operation IDs by shards keys") : await requestFn();
    }

    async getStageProfiling(operationId: string, waitOptions?: WaitOptions<ExecutionStages>): Promise<ExecutionStages> {
        this.logger.debug(`Getting stage profiling for operation ${operationId}`);
        const requestFn = async (): Promise<ExecutionStages> => {
            let lastError: unknown;

            for (const client of this.clients) {
                try {
                    const map = await client.getStageProfilings([operationId]);
                    const result = map[operationId];
                    if (!result) {
                        this.logger.warn(`No stageProfiling data for operationId=${operationId}`);
                        throw new Error(`No stageProfiling data for operationId=${operationId}`);
                    }
                    this.logger.debug(`Stage profiling retrieved successfully`);
                    return result;
                } catch (error) {
                    this.logger.warn(`Failed to get stage profiling using one of the endpoints`);
                    lastError = error;
                }
            }
            this.logger.error('All endpoints failed to get stage profiling');
            throw allEndpointsFailedError(lastError);
        };

        return waitOptions ? await waitUntilSuccess(waitOptions, requestFn, "OperationTracker: Getting stage profiling") : await requestFn();
    }

    async getStageProfilings(
        operationIds: string[],
        waitOptions?: WaitOptions<ExecutionStagesByOperationId>,
        chunkSize: number = 100,
    ): Promise<ExecutionStagesByOperationId> {
        this.logger.debug(`Getting stage profilings for operations: ${operationIds.join(', ')}`);
        this.logger.debug(`Chunk size: ${chunkSize}`);
        const requestFn = async (): Promise<ExecutionStagesByOperationId> => {
            let lastError: unknown;
            for (const client of this.clients) {
                try {
                    const result = await client.getStageProfilings(operationIds, chunkSize);
                    this.logger.debug(`Stage profilings retrieved successfully`);
                    return result;
                } catch (error) {
                    this.logger.warn(`Failed to get stage profilings using one of the endpoints`);
                    lastError = error;
                }
            }
            this.logger.error('All endpoints failed to get stage profilings');
            throw allEndpointsFailedError(lastError);
        };

        return waitOptions ? await waitUntilSuccess(waitOptions, requestFn, "OperationTracker: Getting stage profilings") : await requestFn();
    }

    async getOperationStatuses(
        operationIds: string[],
        waitOptions?: WaitOptions<StatusInfosByOperationId>,
        chunkSize: number = 100,
    ): Promise<StatusInfosByOperationId> {
        this.logger.debug(`Getting operation statuses for operations: ${formatObjectForLogging(operationIds)}`);
        this.logger.debug(`Chunk size: ${chunkSize}`);
        const requestFn = async (): Promise<StatusInfosByOperationId> => {
            let lastError: unknown;
            for (const client of this.clients) {
                try {
                    const result = await client.getOperationStatuses(operationIds, chunkSize);
                    this.logger.debug(`Operation statuses retrieved successfully`);
                    return result;
                } catch (error) {
                    this.logger.warn(`Failed to get operation statuses using one of the endpoints`);
                    lastError = error;
                }
            }
            this.logger.error('All endpoints failed to get operation statuses');
            throw allEndpointsFailedError(lastError);
        };

        return waitOptions ? await waitUntilSuccess(waitOptions, requestFn, "OperationTracker: Getting operation statuses") : await requestFn();
    }

    async getOperationStatus(operationId: string, waitOptions?: WaitOptions<StatusInfo>): Promise<StatusInfo> {
        this.logger.debug(`Getting operation status for ${formatObjectForLogging(operationId)}`);
        const requestFn = async (): Promise<StatusInfo> => {
            let lastError: unknown;

            for (const client of this.clients) {
                try {
                    const map = await client.getOperationStatuses([operationId]);
                    const result = map[operationId];
                    if (!result) {
                        this.logger.warn(`No operation status for operationId=${operationId}`);
                        throw new Error(`No operation status for operationId=${operationId}`);
                    }
                    this.logger.debug(`Operation status retrieved successfully`);
                    return result;
                } catch (error) {
                    this.logger.warn(`Failed to get operation status using one of the endpoints`);
                    lastError = error;
                }
            }
            this.logger.error('All endpoints failed to get operation status');
            throw allEndpointsFailedError(lastError);
        };

        return waitOptions ? await waitUntilSuccess(waitOptions, requestFn, "OperationTracker: Getting operation status") : await requestFn();
    }

    async getSimplifiedOperationStatus(transactionLinker: TransactionLinker): Promise<SimplifiedStatuses> {
        this.logger.debug(
            `Getting simplified operation status for transaction linker: ${formatObjectForLogging(transactionLinker)}`,
        );

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
        waitOptions?: WaitOptions<ConvertedCurrencyResult>,
    ): Promise<ConvertedCurrencyResult> {
        this.logger.debug(`Converting currency: ${formatObjectForLogging(params)}`);

        const requestFn = async (): Promise<ConvertedCurrencyResult> => {
            let lastError: unknown;
            for (const client of this.clients) {
                try {
                    const result = await client.convertCurrency(params);
                    this.logger.debug(`Conversion result retrieved successfully`);
                    return result;
                } catch (error) {
                    this.logger.warn(`Failed to convert currency using one of the endpoints`);
                    lastError = error;
                }
            }
            this.logger.error('All endpoints failed to convert currency');
            throw allEndpointsFailedError(lastError);
        };

        return waitOptions ? await waitUntilSuccess(waitOptions, requestFn, "OperationTracker: Converting currency") : await requestFn();
    }

    async simulateTACMessage(
        params: TACSimulationParams,
        waitOptions?: WaitOptions<TACSimulationResult>,
    ): Promise<TACSimulationResult> {
        Validator.validateTACSimulationParams(params);
        this.logger.debug(`Simulating TAC message: ${formatObjectForLogging(params)}`);

        const requestFn = async (): Promise<TACSimulationResult> => {
            let lastError: unknown;
            for (const client of this.clients) {
                try {
                    const result = await client.simulateTACMessage(params);
                    this.logger.debug(`Simulation result retrieved successfully`);
                    return result;
                } catch (error) {
                    this.logger.warn(`Failed to simulate TAC message using one of the endpoints`);
                    lastError = error;
                }
            }
            this.logger.error('All endpoints failed to simulate TAC message');
            throw allEndpointsFailedError(lastError);
        };

        return waitOptions ? await waitUntilSuccess(waitOptions, requestFn, "OperationTracker: Simulating TAC message") : await requestFn();
    }

    async getTVMExecutorFee(
        params: GetTVMExecutorFeeParams,
        waitOptions?: WaitOptions<SuggestedTVMExecutorFee>,
    ): Promise<SuggestedTVMExecutorFee> {
        this.logger.debug(`get TVM executor fee: ${formatObjectForLogging(params)}`);

        const requestFn = async (): Promise<SuggestedTVMExecutorFee> => {
            let lastError: unknown;
            for (const client of this.clients) {
                try {
                    const result = await client.getTVMExecutorFee(params);
                    this.logger.debug(`Suggested TVM executor fee retrieved successfully`);
                    return result;
                } catch (error) {
                    this.logger.warn(`Failed to get TVM executor fee using one of the endpoints`);
                    lastError = error;
                }
            }
            this.logger.error('All endpoints failed to get TVM executor fee');
            throw allEndpointsFailedError(lastError);
        };

        return waitOptions ? await waitUntilSuccess(waitOptions, requestFn, "OperationTracker: Getting TVM executor fee") : await requestFn();
    }
}
