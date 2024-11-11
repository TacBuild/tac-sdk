import axios from 'axios';
import { TransactionLinker } from "../structs/Struct"

const PUBLIC_LITE_SEQUENCER_IPs = ["localhost"]
const PUBLIC_LITE_SEQUENCER_PORTs = ["8080"]

export async function getOperationId(transactionLinker: TransactionLinker) {
    const lite_sequencer_ip = PUBLIC_LITE_SEQUENCER_IPs[0]; 
    const lite_sequencer_port = PUBLIC_LITE_SEQUENCER_PORTs[0];
    try {
        const response = await axios.get(`http://${lite_sequencer_ip}:${lite_sequencer_port}/operationId`, {
            params: { 
                queryId: transactionLinker.query_id, 
                caller: transactionLinker.caller, 
                shardCount: transactionLinker.shard_count,
                timestamp: transactionLinker.timestamp,
            }
        });
        return response.data.response || "";
    } catch (error) {
        console.error("Error fetching operation ID:", error);
        throw new Error("Failed to fetch operation ID");
    }
}

export async function getStatusTransaction(operationId: string) {
    const lite_sequencer_ip = PUBLIC_LITE_SEQUENCER_IPs[0]; 
    const lite_sequencer_port = PUBLIC_LITE_SEQUENCER_PORTs[0];

    try {
        const response = await axios.get(`http://${lite_sequencer_ip}:${lite_sequencer_port}/status`, {
            params: { operationId }
        });
        return response.data.response || "";
    } catch (error) {
        console.error("Error fetching operation ID:", error);
        throw new Error("Failed to fetch operation ID");
    }
}
