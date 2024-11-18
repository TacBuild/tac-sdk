import axios from 'axios';
import type { TransactionLinker } from '../structs/Struct';
import { SimplifiedStatuses } from '../structs/Struct';
const PUBLIC_LITE_SEQUENCER_ENDPOINTS = ['https://turin.data.tac.build'];

export async function getOperationId(transactionLinker: TransactionLinker, customLiteSequencerEndpoint?: string[]) {
  const endpoints = customLiteSequencerEndpoint
    ? customLiteSequencerEndpoint
    : PUBLIC_LITE_SEQUENCER_ENDPOINTS;

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
      if (customLiteSequencerEndpoint) {
        throw new Error('Failed to get OperationId with custom endpoint');
      }
    }
  }
  throw new Error('Failed to fetch OperationId');
}

export async function getStatusTransaction(operationId: string, customLiteSequencerEndpoint?: string[]) {
  const endpoints = customLiteSequencerEndpoint
    ? customLiteSequencerEndpoint
    : PUBLIC_LITE_SEQUENCER_ENDPOINTS;

  for (const endpoint of endpoints) {
    try {
      const response = await axios.get(`${endpoint}/status`, {
        params: { operationId: operationId }
      });
      return response.data.response || '';
    } catch (error) {
      console.error(`Error fetching status transaction with ${endpoint}:`, error);

      if (customLiteSequencerEndpoint) {
        throw new Error('Failed to get status transaction with custom endpoint');
      }
    }
  }
  throw new Error('Failed to fetch status transaction');
}

const TERMINETED_STATUS = "TVMMerkleMessageExecuted";

export async function getSimpifiedTransactionStatus(transactionLinker: TransactionLinker, customLiteSequencerEndpoint?: string[]) {
  const operationId = await getOperationId(transactionLinker, customLiteSequencerEndpoint)
  if (operationId == "") {
    return SimplifiedStatuses.OperationIdNotFound;
  }

  const status = await getStatusTransaction(operationId, customLiteSequencerEndpoint);
  if (status == TERMINETED_STATUS) {
    return SimplifiedStatuses.Successful;
  } 

  return SimplifiedStatuses.Pending;
}
