import type { SenderAbstraction } from '../sender';
import { CrosschainTx, ExecutionFeeEstimationResult, GeneratePayloadParams } from '../structs/Struct';
import { Asset } from './Asset';

export interface ISimulator {
    /**
     * Simulates a list of cross-chain transactions for a given sender.
     * @param sender Sender abstraction used to provide context (e.g., wallet state).
     * @param txs Cross-chain transactions to simulate.
     * @returns Promise with fee estimation results, one for each input transaction.
     */
    getSimulationsInfo(sender: SenderAbstraction, txs: CrosschainTx[]): Promise<ExecutionFeeEstimationResult[]>;

    /**
     * Get tvm fees and simulation info for a tvm transaction using sender abstraction.
     * @param sender Sender abstraction used to provide context (e.g., wallet state).
     * @param tx Cross-chain transaction to simulate.
     * @returns Promise with fee estimation and execution info.
     */
    getSimulationInfo(sender: SenderAbstraction, tx: CrosschainTx): Promise<ExecutionFeeEstimationResult>;

    /**
     * Estimates the total TON network fees required for a cross-chain transaction.
     * @param assets Assets to be included in the transaction.
     * @returns The total estimated fee in nanotons (1 TON = 10^9 nanotons) for processing all provided assets.
     */
    estimateTONFees(assets: Asset[], params: GeneratePayloadParams): number;
}
