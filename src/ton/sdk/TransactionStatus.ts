import axios from 'axios';
import { TransactionLinker } from "../structs/Struct"

const PUBLIC_LITE_SEQUENCER_ENDPOINTS = ["localhost:8080"]

export async function getOperationId(transactionLinker: TransactionLinker, customLiteSequencerEndpoint?: string) {
    const endpoints = customLiteSequencerEndpoint 
    ? [customLiteSequencerEndpoint]
    : PUBLIC_LITE_SEQUENCER_ENDPOINTS;

    for (const endpoint of endpoints) {
        try {
            const response = await axios.get(`http://${endpoint}/operationId`, {
                params: { 
                    queryId: transactionLinker.queryId, 
                    caller: transactionLinker.caller, 
                    shardCount: transactionLinker.shardCount,
                    timestamp: transactionLinker.timestamp,
                }
            });
            return response.data.response || "";
        } catch (error) {
            console.error(`Failed to get OperationId with ${endpoint}:`, error);
            if (customLiteSequencerEndpoint) {
                throw new Error(`Failed to get OperationId with custom endpoint`);
            }
        }
    }
    throw new Error("Failed to fetch OperationId");
}

export async function getStatusTransaction(operationId: string, customLiteSequencerEndpoint?: string) {
    const endpoints = customLiteSequencerEndpoint 
    ? [customLiteSequencerEndpoint]
    : PUBLIC_LITE_SEQUENCER_ENDPOINTS;

    for (const endpoint of endpoints) {
        try {
            const response = await axios.get(`http://${endpoint}/operationId`, {
                params: { operationId }
            });
            return response.data.response || "";
        } catch (error) {
            console.error(`Error fetching status transaction with ${endpoint}:`, error);

            if (customLiteSequencerEndpoint) {
                throw new Error(`Failed to get status transaction with custom endpoint`);
            }
        }
    }
    throw new Error("Failed to fetch status transaction");
}
