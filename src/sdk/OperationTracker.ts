import axios from 'axios';

import { Network, TransactionLinker, SimplifiedStatuses, StatusesResponse, StatusByOperationId } from '../structs/Struct';
import { MAINNET_PUBLIC_LITE_SEQUENCER_ENDPOINTS, TESTNET_PUBLIC_LITE_SEQUENCER_ENDPOINTS } from './Consts';
import { operationFetchError, statusFetchError } from '../errors';

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
                ? TESTNET_PUBLIC_LITE_SEQUENCER_ENDPOINTS
                : MAINNET_PUBLIC_LITE_SEQUENCER_ENDPOINTS);
    }

    async getOperationId(transactionLinker: TransactionLinker): Promise<string> {
        for (const endpoint of this.customLiteSequencerEndpoints) {
            try {
                const response = await axios.get(`${endpoint}/operationId`, {
                    params: {
                        shardedId: transactionLinker.shardedId,
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

    async getOperationStatus(operationId: string): Promise<StatusByOperationId> {
        for (const endpoint of this.customLiteSequencerEndpoints) {
            try {
                const response = await axios.post<StatusesResponse>(`${endpoint}/status`, {
                    operationIds: [operationId],
                });

                const result = response.data.response.find((s) => s.operation_id === operationId);
                if (!result) {
                    throw statusFetchError('operation is not found in response');
                }

                return result;
            } catch (error) {
                console.error(`Error fetching status transaction with ${endpoint}:`, error);
            }
        }
        throw statusFetchError('all endpoints failed to complete request');
    }

    async getSimplifiedOperationStatus(
        transactionLinker: TransactionLinker,
        isBridgeOperation: boolean = false,
    ): Promise<SimplifiedStatuses> {
        const operationId = await this.getOperationId(transactionLinker);
        if (operationId == '') {
            return SimplifiedStatuses.OperationIdNotFound;
        }

        const { status, error_message } = await this.getOperationStatus(operationId);
        if (error_message) {
            return SimplifiedStatuses.Failed;
        }
        const finalStatus = isBridgeOperation ? this.BRIDGE_TERMINATED_STATUS : this.TERMINATED_STATUS;
        if (status == finalStatus) {
            return SimplifiedStatuses.Successful;
        }

        return SimplifiedStatuses.Pending;
    }
}
