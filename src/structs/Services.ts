import { mainnet, testnet } from '@tonappchain/artifacts';
import { Wallet } from 'ethers';

import type { SenderAbstraction } from '../sender';
import { InternalTACParams, InternalTONParams } from './InternalStruct';
import {
    Asset,
    CrossChainTransactionOptions,
    CrosschainTx,
    EvmProxyMsg,
    ExecutionFeeEstimationResult,
    ExecutionStages,
    ExecutionStagesByOperationId,
    Network,
    NFTAddressType,
    NFTItemData,
    OperationIdsByShardsKey,
    OperationType,
    SimplifiedStatuses,
    StatusInfo,
    StatusInfosByOperationId,
    SuggestedTONExecutorFee,
    TACSimulationRequest,
    TACSimulationResult,
    TransactionLinker,
    TransactionLinkerWithOperationId,
    UserWalletBalanceExtended,
    WaitOptions,
} from './Struct';

export interface IConfiguration {
    readonly network: Network;
    readonly artifacts: typeof testnet | typeof mainnet;
    readonly TONParams: InternalTONParams;
    readonly TACParams: InternalTACParams;
    readonly liteSequencerEndpoints: string[];
    readonly nativeTONAddress: string;
    nativeTACAddress(): Promise<string>;
    readonly getTrustedTACExecutors: string[];
    readonly getTrustedTONExecutors: string[];
    closeConnections(): unknown;
    isContractDeployedOnTVM(address: string): Promise<boolean>;
}

export interface ILogger {
    debug(...arg: unknown[]): void;
    info(...arg: unknown[]): void;
    warn(...arg: unknown[]): void;
    error(...arg: unknown[]): void;
}

export interface ISimulator {
    simulateTACMessage(req: TACSimulationRequest): Promise<TACSimulationResult>;
    simulateTransactions(sender: SenderAbstraction, txs: CrosschainTx[]): Promise<TACSimulationResult[]>;
    getTVMExecutorFeeInfo(assets: Asset[], feeSymbol: string): Promise<SuggestedTONExecutorFee>;
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
    ): Promise<ExecutionFeeEstimationResult>;
}

export interface IOperationTracker {
    getOperationType(operationId: string, waitOptions?: WaitOptions<OperationType>): Promise<OperationType>;
    getOperationId(transactionLinker: TransactionLinker, waitOptions?: WaitOptions<string>): Promise<string>;
    getOperationIdByTransactionHash(transactionHash: string, waitOptions?: WaitOptions<string>): Promise<string>;
    getOperationIdsByShardsKeys(
        shardsKeys: string[],
        caller: string,
        waitOptions?: WaitOptions<OperationIdsByShardsKey>,
        chunkSize?: number,
    ): Promise<OperationIdsByShardsKey>;
    getStageProfiling(operationId: string, waitOptions?: WaitOptions<ExecutionStages>): Promise<ExecutionStages>;
    getStageProfilings(
        operationIds: string[],
        waitOptions?: WaitOptions<ExecutionStagesByOperationId>,
        chunkSize?: number,
    ): Promise<ExecutionStagesByOperationId>;
    getOperationStatuses(
        operationIds: string[],
        waitOptions?: WaitOptions<StatusInfosByOperationId>,
        chunkSize?: number,
    ): Promise<StatusInfosByOperationId>;
    getOperationStatus(operationId: string, waitOptions?: WaitOptions<StatusInfo>): Promise<StatusInfo>;
    getSimplifiedOperationStatus(transactionLinker: TransactionLinker): Promise<SimplifiedStatuses>;
}

export interface ITacSDK {
    readonly config: IConfiguration;
    
    // Configuration getters
    get nativeTONAddress(): string;
    nativeTACAddress(): Promise<string>;
    get getTrustedTACExecutors(): string[];
    get getTrustedTONExecutors(): string[];
    
    // Connection management
    closeConnections(): unknown;
    
    // Simulation methods
    simulateTACMessage(req: TACSimulationRequest): Promise<TACSimulationResult>;
    simulateTransactions(sender: SenderAbstraction, txs: CrosschainTx[]): Promise<TACSimulationResult[]>;
    getTransactionSimulationInfo(
        evmProxyMsg: EvmProxyMsg,
        sender: SenderAbstraction,
        assets?: Asset[],
    ): Promise<ExecutionFeeEstimationResult>;
    getTVMExecutorFeeInfo(assets: Asset[], feeSymbol: string): Promise<SuggestedTONExecutorFee>;
    
    // Transaction methods
    sendCrossChainTransaction(
        evmProxyMsg: EvmProxyMsg,
        sender: SenderAbstraction,
        assets?: Asset[],
        options?: CrossChainTransactionOptions,
        waitOptions?: WaitOptions<string>,
    ): Promise<TransactionLinkerWithOperationId>;
    sendCrossChainTransactions(
        sender: SenderAbstraction,
        txs: CrosschainTx[],
        waitOptions?: WaitOptions<OperationIdsByShardsKey>,
    ): Promise<TransactionLinkerWithOperationId[]>;
    
    // Bridge methods
    bridgeTokensToTON(
        signer: Wallet,
        value: bigint,
        tonTarget: string,
        assets?: Asset[],
        tvmExecutorFee?: bigint,
    ): Promise<string>;
    
    // Jetton methods
    getUserJettonWalletAddress(userAddress: string, tokenAddress: string): Promise<string>;
    getUserJettonBalance(userAddress: string, tokenAddress: string): Promise<bigint>;
    getUserJettonBalanceExtended(userAddress: string, tokenAddress: string): Promise<UserWalletBalanceExtended>;
    
    // NFT methods
    getNFTItemData(itemAddress: string): Promise<NFTItemData>;
    
    // Address conversion methods
    getEVMTokenAddress(tvmTokenAddress: string): Promise<string>;
    getTVMTokenAddress(evmTokenAddress: string): Promise<string>;
    getTVMNFTAddress(evmNFTAddress: string, tokenId?: number | bigint): Promise<string>;
    getEVMNFTAddress(tvmNFTAddress: string, addressType: NFTAddressType): Promise<string>;
    
    // Utility methods
    isContractDeployedOnTVM(address: string): Promise<boolean>;
}
