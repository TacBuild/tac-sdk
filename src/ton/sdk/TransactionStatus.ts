import axios from 'axios';
import type {TransactionLinker} from '../structs/Struct';
import {SimplifiedStatuses} from '../structs/Struct';
import {PUBLIC_LITE_SEQUENCER_ENDPOINTS} from "./Consts";

export class TransactionStatus {
    readonly TERMINATED_STATUS = 'TVMMerkleMessageExecuted';

    readonly CustomLiteSequencerEndpoints: string[] | undefined;

    constructor(customLiteSequencerEndpoints?: string[]) {
        this.CustomLiteSequencerEndpoints = customLiteSequencerEndpoints;
    }

    async getOperationId(transactionLinker: TransactionLinker) {
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
                        timestamp: transactionLinker.timestamp
                    }
                });
                return response.data.response || '';
            } catch (error) {
                console.error(`Failed to get OperationId with ${endpoint}:`, error);
            }
        }
        throw new Error('Failed to fetch OperationId');
    }

    async getStatusTransaction(operationId: string) {
        const endpoints = this.CustomLiteSequencerEndpoints
            ? this.CustomLiteSequencerEndpoints
            : PUBLIC_LITE_SEQUENCER_ENDPOINTS;

        for (const endpoint of endpoints) {
            try {
                const response = await axios.get(`${endpoint}/status`, {
                    params: {operationId: operationId}
                });
                return response.data.response || '';
            } catch (error) {
                console.error(`Error fetching status transaction with ${endpoint}:`, error);
            }
        }
        throw new Error('Failed to fetch status transaction');
    }

    async getSimplifiedTransactionStatus(transactionLinker: TransactionLinker): Promise<SimplifiedStatuses> {
        const operationId = await this.getOperationId(transactionLinker)
        if (operationId == "") {
            return SimplifiedStatuses.OperationIdNotFound;
        }

        const status = await this.getStatusTransaction(operationId);
        if (status == this.TERMINATED_STATUS) {
            return SimplifiedStatuses.Successful;
        }

        return SimplifiedStatuses.Pending;
    };
}