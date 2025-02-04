import axios from 'axios';

import {
    Network,
    TransactionLinker,
    SimplifiedStatuses,
    StatusesResponse,
    StatusByOperationId,
} from '../structs/Struct';
import { operationFetchError, statusFetchError } from '../errors';
import { convertKeysToCamelCase } from './Utils';
import { mainnet, testnet } from '@tonappchain/artifacts';

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
                const response = await axios.post<StatusesResponse>(
                    `${endpoint}/status`,
                    {
                        operationIds: [operationId],
                    },
                    {
                        transformResponse: [
                            (data) => {
                                try {
                                    const parsedData = JSON.parse(data);
                                    return convertKeysToCamelCase(parsedData);
                                } catch {
                                    return data;
                                }
                            },
                        ],
                    },
                );

                const result = response.data.response.find((s) => s.operationId === operationId);
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

        const { status, errorMessage } = await this.getOperationStatus(operationId);
        if (errorMessage) {
            return SimplifiedStatuses.Failed;
        }
        const finalStatus = isBridgeOperation ? this.BRIDGE_TERMINATED_STATUS : this.TERMINATED_STATUS;
        if (status == finalStatus) {
            return SimplifiedStatuses.Successful;
        }

        return SimplifiedStatuses.Pending;
    }
}
