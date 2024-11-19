import axios from 'axios';
import type { TransactionLinker } from '../structs/Struct';
import { SimplifiedStatuses } from '../structs/Struct';

export class TransactionStatus {
  readonly PUBLIC_LITE_SEQUENCER_ENDPOINTS = ['https://turin.data.tac.build'];
  readonly TERMINETED_STATUS = "TVMMerkleMessageExecuted";

  readonly CustomLiteSequencerEndpoints: string[] | undefined;

  constructor(customLiteSequencerEndpoints?: string[]) {
    this.CustomLiteSequencerEndpoints = customLiteSequencerEndpoints;
  }

  async getOperationId(transactionLinker: TransactionLinker) {
    const endpoints = this.CustomLiteSequencerEndpoints
      ? this.CustomLiteSequencerEndpoints
      : this.PUBLIC_LITE_SEQUENCER_ENDPOINTS;

    for (const endpoint of endpoints) {
      try {
        const response = await axios.get(`${endpoint}/operationId`, {
          params: {
            queryId: transactionLinker.queryId,
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
      : this.PUBLIC_LITE_SEQUENCER_ENDPOINTS;

    for (const endpoint of endpoints) {
      try {
        const response = await axios.get(`${endpoint}/status`, {
          params: { operationId: operationId }
        });
        return response.data.response || '';
      } catch (error) {
        console.error(`Error fetching status transaction with ${endpoint}:`, error);
      }
    }
    throw new Error('Failed to fetch status transaction');
  }

  async getSimpifiedTransactionStatus(transactionLinker: TransactionLinker) {
    const operationId = await this.getOperationId(transactionLinker)
    if (operationId == "") {
      return SimplifiedStatuses.OperationIdNotFound;
    }

    const status = await this.getStatusTransaction(operationId);
    if (status == this.TERMINETED_STATUS) {
      return SimplifiedStatuses.Successful;
    } 

    return SimplifiedStatuses.Pending;
  };
}