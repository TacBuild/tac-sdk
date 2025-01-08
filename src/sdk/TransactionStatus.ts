import axios from 'axios';

import {Network, TransactionLinker} from '../structs/Struct';
import {SimplifiedStatuses} from '../structs/Struct';
import {MAINNET_PUBLIC_LITE_SEQUENCER_ENDPOINTS, TESTNET_PUBLIC_LITE_SEQUENCER_ENDPOINTS} from './Consts';
import {operationFetchError, statusFetchError} from '../errors';

export class TransactionStatus {
    readonly TERMINATED_STATUS = 'TVMMerkleMessageExecuted';
    readonly BRIDGE_TERMINATED_STATUS = 'EVMMerkleMessageExecuted';

    readonly network: Network;
    readonly CustomLiteSequencerEndpoints: string[] | undefined;

    constructor(network: Network, customLiteSequencerEndpoints?: string[]) {
        this.network = network;
        this.CustomLiteSequencerEndpoints = customLiteSequencerEndpoints;
    }

    async getOperationId(transactionLinker: TransactionLinker): Promise<string> {
        const PUBLIC_LITE_SEQUENCER_ENDPOINTS = this.network === Network.Testnet
            ? TESTNET_PUBLIC_LITE_SEQUENCER_ENDPOINTS
            : MAINNET_PUBLIC_LITE_SEQUENCER_ENDPOINTS;

        const endpoints = this.CustomLiteSequencerEndpoints
            ? this.CustomLiteSequencerEndpoints
            : PUBLIC_LITE_SEQUENCER_ENDPOINTS;

        for (const endpoint of endpoints) {
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

    async getStatusTransaction(operationId: string): Promise<string> {
        const PUBLIC_LITE_SEQUENCER_ENDPOINTS = this.network === Network.Testnet
            ? TESTNET_PUBLIC_LITE_SEQUENCER_ENDPOINTS
            : MAINNET_PUBLIC_LITE_SEQUENCER_ENDPOINTS;

        const endpoints = this.CustomLiteSequencerEndpoints
            ? this.CustomLiteSequencerEndpoints
            : PUBLIC_LITE_SEQUENCER_ENDPOINTS;

        for (const endpoint of endpoints) {
            try {
                const response = await axios.get(`${endpoint}/status`, {
                    params: {operationId: operationId},
                });
                return response.data.response || '';
            } catch (error) {
                console.error(`Error fetching status transaction with ${endpoint}:`, error);
            }
        }
        throw statusFetchError;
    }

    async getSimplifiedTransactionStatus(
        transactionLinker: TransactionLinker,
        isBridgeOperation: boolean = false,
    ): Promise<SimplifiedStatuses> {
        const operationId = await this.getOperationId(transactionLinker);
        if (operationId == '') {
            return SimplifiedStatuses.OperationIdNotFound;
        }

        const status = await this.getStatusTransaction(operationId);
        const finalStatus = isBridgeOperation ? this.BRIDGE_TERMINATED_STATUS : this.TERMINATED_STATUS;
        if (status == finalStatus) {
            return SimplifiedStatuses.Successful;
        }

        return SimplifiedStatuses.Pending;
    }
}
