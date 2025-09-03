import { Wallet } from 'ethers';

import type { SenderAbstraction } from '../sender';
import {
    Asset,
    CrossChainTransactionOptions,
    CrosschainTx,
    EvmProxyMsg,
    ExecutionFeeEstimationResult,
    NFTAddressType,
    NFTItemData,
    OperationIdsByShardsKey,
    SuggestedTONExecutorFee,
    TACSimulationRequest,
    TACSimulationResult,
    TransactionLinkerWithOperationId,
    UserWalletBalanceExtended,
    WaitOptions,
} from '../structs/Struct';
import { IConfiguration } from './IConfiguration';

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
    getTVMExecutorFeeInfo(
        assets: Asset[],
        feeSymbol: string,
        tvmValidExecutors?: string[],
    ): Promise<SuggestedTONExecutorFee>;

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
        tvmValidExecutors?: string[],
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
