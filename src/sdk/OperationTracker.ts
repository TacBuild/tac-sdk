import axios from 'axios';

import {
    Network,
    TransactionLinker,
    SimplifiedStatuses,
    StatusByOperationId,
} from '../structs/Struct';
import { operationFetchError, statusFetchError } from '../errors';
import { toCamelCaseTransformer } from './Utils';
import { mainnet, testnet } from '@tonappchain/artifacts';
import { StatusesResponse } from '../structs/InternalStruct';

export class OperationTracker {
    readonly TERMINATED_STATUS = 'TVMMerkleMessageExecutionSuccessful';
    readonly BRIDGE_TERMINATED_STATUS = 'EVMMerkleMessageExecutionSuccessful';
    readonly EVM_FAILED_STATUS = "EVMMerkleMessageExecutionFailed";
    readonly TVM_FAILED_STATUS = "TVMMerkleMessageExecutionFailed";

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

    async getOperationStatus(operationIds: string[]): Promise<StatusByOperationId> {
        for (const endpoint of this.customLiteSequencerEndpoints) {
            try {
                const response = await axios.post<StatusesResponse>(
                    `${endpoint}/status`,
                    {
                        operationIds,
                    },
                );
                
                return response.data.response;
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

        const status = await this.getOperationStatus([operationId]);
        
        if (status[operationId].status_name == this.EVM_FAILED_STATUS || status[operationId].status_name == this.TVM_FAILED_STATUS) {
            return SimplifiedStatuses.Failed;
        }

        const finalStatus = isBridgeOperation ? this.BRIDGE_TERMINATED_STATUS : this.TERMINATED_STATUS;
        if (status[operationId].status_name == finalStatus) {
            return SimplifiedStatuses.Successful;
        }

        return SimplifiedStatuses.Pending;
    }
}
