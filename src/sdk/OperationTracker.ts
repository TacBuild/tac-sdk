import { mainnet, testnet } from '@tonappchain/artifacts';

import { allEndpointsFailedError } from '../errors';
import {
    ExecutionStages,
    ExecutionStagesByOperationId,
    Network,
    OperationIdsByShardsKey,
    OperationType,
    SimplifiedStatuses,
    StatusInfo,
    StatusInfosByOperationId,
    TransactionLinker,
} from '../structs/Struct';
import { LiteSequencerClient } from './LiteSequencerClient';
import { WaitOptions, waitUntilSuccess } from './Utils';

export class OperationTracker {
    private readonly clients: LiteSequencerClient[];
    private readonly debug: boolean;

    constructor(network: Network, customLiteSequencerEndpoints?: string[], debug: boolean = false) {
        const endpoints =
            customLiteSequencerEndpoints ??
            (network === Network.TESTNET
                ? testnet.PUBLIC_LITE_SEQUENCER_ENDPOINTS
                : mainnet.PUBLIC_LITE_SEQUENCER_ENDPOINTS);

        this.clients = endpoints.map((endpoint) => new LiteSequencerClient(endpoint));
        this.debug = debug;
    }

    private debugLog(message: string) {
        if (this.debug) {
            console.log(`[OperationTracker Debug] ${message}`);
        }
    }

    async getOperationType(operationId: string, waitOptions?: WaitOptions<OperationType>): Promise<OperationType> {
        this.debugLog(`Getting operation type for ${operationId}`);

        const requestFn = async (): Promise<OperationType> => {
            let lastError: unknown;
            for (const client of this.clients) {
                try {
                    const type = await client.getOperationType(operationId);
                    this.debugLog(`Operation retrieved successfully`);
                    return type;
                } catch (error) {
                    this.debugLog(`Failed to get operationType using one of the endpoints`);
                    lastError = error;
                }
            }
            this.debugLog('All endpoints failed to get operation type');
            throw allEndpointsFailedError(lastError);
        };

        return waitOptions ? await waitUntilSuccess(waitOptions, requestFn) : await requestFn();
    }

    async getOperationId(transactionLinker: TransactionLinker, waitOptions?: WaitOptions<string>): Promise<string> {
        this.debugLog(`Getting operation ID for transaction linker: ${JSON.stringify(transactionLinker)}`);

        const requestFn = async (): Promise<string> => {
            let lastError: unknown;
            for (const client of this.clients) {
                try {
                    const id = await client.getOperationId(transactionLinker);
                    this.debugLog(`Operation ID ${id == '' ? 'does not exist' : 'retrieved successfully'}`);
                    return id;
                } catch (error) {
                    this.debugLog(`Failed to get OperationId using one of the endpoints`);
                    lastError = error;
                }
            }
            this.debugLog('All endpoints failed to get operation id');
            throw allEndpointsFailedError(lastError);
        };

        return waitOptions ? await waitUntilSuccess(waitOptions, requestFn) : await requestFn();
    }

    async getOperationIdsByShardsKeys(
        shardsKeys: string[],
        caller: string,
        waitOptions?: WaitOptions<OperationIdsByShardsKey>,
        chunkSize: number = 100,
    ): Promise<OperationIdsByShardsKey> {
        this.debugLog(`Getting operation IDs for shards keys: ${shardsKeys.join(', ')}`);
        this.debugLog(`Caller: ${caller}, Chunk size: ${chunkSize}`);
        const requestFn = async (): Promise<OperationIdsByShardsKey> => {
            let lastError: unknown;

            for (const client of this.clients) {
                try {
                    const result = await client.getOperationIdsByShardsKeys(shardsKeys, caller, chunkSize);
                    this.debugLog(`Operation IDs by shards keys retrieved successfully`);
                    return result;
                } catch (error) {
                    this.debugLog(`Failed to get OperationIds using one of the endpoints`);
                    lastError = error;
                }
            }
            this.debugLog('All endpoints failed to get operation ids by shards keys');
            throw allEndpointsFailedError(lastError);
        };

        return waitOptions ? await waitUntilSuccess(waitOptions, requestFn) : await requestFn();
    }

    async getStageProfiling(operationId: string, waitOptions?: WaitOptions<ExecutionStages>): Promise<ExecutionStages> {
        this.debugLog(`Getting stage profiling for operation ${operationId}`);
        const requestFn = async (): Promise<ExecutionStages> => {
            let lastError: unknown;

            for (const client of this.clients) {
                try {
                    const map = await client.getStageProfilings([operationId]);
                    const result = map[operationId];
                    if (!result) {
                        this.debugLog(`No stageProfiling data for operationId=${operationId}`);
                        throw new Error(`No stageProfiling data for operationId=${operationId}`);
                    }
                    this.debugLog(`Stage profiling retrieved successfully`);
                    return result;
                } catch (error) {
                    this.debugLog(`Failed to get stage profiling using one of the endpoints`);
                    lastError = error;
                }
            }
            this.debugLog('All endpoints failed to get stage profiling');
            throw allEndpointsFailedError(lastError);
        };

        return waitOptions ? await waitUntilSuccess(waitOptions, requestFn) : await requestFn();
    }

    async getStageProfilings(
        operationIds: string[],
        waitOptions?: WaitOptions<ExecutionStagesByOperationId>,
        chunkSize: number = 100,
    ): Promise<ExecutionStagesByOperationId> {
        this.debugLog(`Getting stage profilings for operations: ${operationIds.join(', ')}`);
        this.debugLog(`Chunk size: ${chunkSize}`);
        const requestFn = async (): Promise<ExecutionStagesByOperationId> => {
            let lastError: unknown;
            for (const client of this.clients) {
                try {
                    const result = await client.getStageProfilings(operationIds, chunkSize);
                    this.debugLog(`Stage profilings retrieved successfully`);
                    return result;
                } catch (error) {
                    this.debugLog(`Failed to get stage profilings using one of the endpoints`);
                    lastError = error;
                }
            }
            this.debugLog('All endpoints failed to get stage profilings');
            throw allEndpointsFailedError(lastError);
        };

        return waitOptions ? await waitUntilSuccess(waitOptions, requestFn) : await requestFn();
    }

    async getOperationStatuses(
        operationIds: string[],
        waitOptions?: WaitOptions<StatusInfosByOperationId>,
        chunkSize: number = 100,
    ): Promise<StatusInfosByOperationId> {
        this.debugLog(`Getting operation statuses for operations: ${operationIds.join(', ')}`);
        this.debugLog(`Chunk size: ${chunkSize}`);
        const requestFn = async (): Promise<StatusInfosByOperationId> => {
            let lastError: unknown;
            for (const client of this.clients) {
                try {
                    const result = await client.getOperationStatuses(operationIds, chunkSize);
                    this.debugLog(`Operation statuses retrieved successfully`);
                    return result;
                } catch (error) {
                    this.debugLog(`Failed to get operation statuses using one of the endpoints`);
                    lastError = error;
                }
            }
            this.debugLog('All endpoints failed to get operation statuses');
            throw allEndpointsFailedError(lastError);
        };

        return waitOptions ? await waitUntilSuccess(waitOptions, requestFn) : await requestFn();
    }

    async getOperationStatus(operationId: string, waitOptions?: WaitOptions<StatusInfo>): Promise<StatusInfo> {
        this.debugLog(`Getting operation status for ${operationId}`);
        const requestFn = async (): Promise<StatusInfo> => {
            let lastError: unknown;

            for (const client of this.clients) {
                try {
                    const map = await client.getOperationStatuses([operationId]);
                    const result = map[operationId];
                    if (!result) {
                        this.debugLog(`No operation status for operationId=${operationId}`);
                        throw new Error(`No operation status for operationId=${operationId}`);
                    }
                    this.debugLog(`Operation status retrieved successfully`);
                    return result;
                } catch (error) {
                    this.debugLog(`Failed to get operation status using one of the endpoints`);
                    lastError = error;
                }
            }
            this.debugLog('All endpoints failed to get operation status');
            throw allEndpointsFailedError(lastError);
        };

        return waitOptions ? await waitUntilSuccess(waitOptions, requestFn) : await requestFn();
    }

    async getSimplifiedOperationStatus(transactionLinker: TransactionLinker): Promise<SimplifiedStatuses> {
        this.debugLog(
            `Getting simplified operation status for transaction linker: ${JSON.stringify(transactionLinker)}`,
        );

        const operationId = await this.getOperationId(transactionLinker);
        if (operationId == '') {
            this.debugLog('Operation ID not found');
            return SimplifiedStatuses.OPERATION_ID_NOT_FOUND;
        }
        this.debugLog(`Operation ID: ${operationId}`);

        const operationType = await this.getOperationType(operationId);
        this.debugLog(`Operation type: ${operationType}`);

        if (operationType == OperationType.PENDING || operationType == OperationType.UNKNOWN) {
            return SimplifiedStatuses.PENDING;
        }

        if (operationType == OperationType.ROLLBACK) {
            return SimplifiedStatuses.FAILED;
        }

        return SimplifiedStatuses.SUCCESSFUL;
    }
}
