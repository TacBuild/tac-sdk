import type { SenderAbstraction } from '../sender';
import {
    Asset,
    CrosschainTx,
    EvmProxyMsg,
    ExecutionFeeEstimationResult,
    SuggestedTONExecutorFee,
    TACSimulationRequest,
    TACSimulationResult,
    TransactionLinker,
} from '../structs/Struct';

export interface ISimulator {
    simulateTACMessage(req: TACSimulationRequest): Promise<TACSimulationResult>;
    simulateTransactions(sender: SenderAbstraction, txs: CrosschainTx[]): Promise<TACSimulationResult[]>;
    getTVMExecutorFeeInfo(
        assets: Asset[],
        feeSymbol: string,
        tvmValidExecutors?: string[],
    ): Promise<SuggestedTONExecutorFee>;
    getTransactionSimulationInfo(
        evmProxyMsg: EvmProxyMsg,
        sender: SenderAbstraction,
        assets?: Asset[],
    ): Promise<ExecutionFeeEstimationResult>;
    getSimulationInfoForTransaction(
        evmProxyMsg: EvmProxyMsg,
        transactionLinker: TransactionLinker,
        assets: Asset[],
        allowSimulationError?: boolean,
        isRoundTrip?: boolean,
        evmValidExecutors?: string[],
        tvmValidExecutors?: string[],
        calculateRollbackFee?: boolean,
    ): Promise<ExecutionFeeEstimationResult>;
}
