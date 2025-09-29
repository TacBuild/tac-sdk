import { SandboxContract } from '@ton/sandbox';
import { OpenedContract } from '@ton/ton';
import { AbstractProvider, Addressable } from 'ethers';

import { JettonMinter, JettonMinterData } from '../../artifacts/tonTypes';
import type { FT, NFT } from '../assets';
import type { Asset, ContractOpener, ILogger } from '../interfaces';

export type ContractState = {
    balance: bigint;
    state: 'active' | 'uninitialized' | 'frozen';
    code: Buffer | null;
};

export enum SimplifiedStatuses {
    PENDING = 'PENDING',
    FAILED = 'FAILED',
    SUCCESSFUL = 'SUCCESSFUL',
    OPERATION_ID_NOT_FOUND = 'OPERATION_ID_NOT_FOUND',
}

export enum Network {
    TESTNET = 'testnet',
    MAINNET = 'mainnet',
    DEV = 'dev',
}

export enum BlockchainType {
    TAC = 'TAC',
    TON = 'TON',
}

export enum CurrencyType {
    TAC = 'TAC',
    TON = 'TON',
}

export enum OperationType {
    PENDING = 'PENDING',
    TON_TAC_TON = 'TON-TAC-TON',
    ROLLBACK = 'ROLLBACK',
    TON_TAC = 'TON-TAC',
    TAC_TON = 'TAC-TON',
    UNKNOWN = 'UNKNOWN',
}

export type TACParams = {
    /**
     * Provider for TAC side. Use your own provider for tests or to increase ratelimit
     */
    provider?: AbstractProvider;

    /**
     * Address of TAC settings contract. Use only for tests.
     */
    settingsAddress?: string | Addressable;
};

export type TONParams = {
    /**
     * Provider for TON side. Use your own provider for tests or to increase ratelimit
     */
    contractOpener?: ContractOpener;

    /**
     * Address of TON settings contract. Use only for tests.
     */
    settingsAddress?: string;
};

export type SDKParams = {
    /**
     * TON CHAIN. For your network use Сustom
     */
    network: Network;

    /**
     * Delay in requests to provider
     */
    delay?: number;

    /**
     * Custom parameters for the TAC blockchain
     */
    TACParams?: TACParams;

    /**
     * Custom parameters for the TON blockchain
     */
    TONParams?: TONParams;

    /**
     * URLs of lite sequencers
     */
    customLiteSequencerEndpoints?: string[];
};

export enum AssetType {
    NFT = 'NFT',
    FT = 'FT',
}

export enum NFTAddressType {
    ITEM = 'ITEM',
    COLLECTION = 'COLLECTION',
}

export type UserWalletBalanceExtended =
    | {
          exists: true;
          amount: number;
          rawAmount: bigint;
          decimals: number;
      }
    | {
          exists: false;
      };

export type EvmProxyMsg = {
    evmTargetAddress: string;
    methodName?: string;
    encodedParameters?: string;
    gasLimit?: bigint;
    [key: string]: unknown;
};

export type TransactionLinker = {
    caller: string;
    shardCount: number;
    shardsKey: string;
    timestamp: number;
    sendTransactionResult?: unknown;
};

export type TransactionLinkerWithOperationId = TransactionLinker & {
    operationId?: string;
};

export type TONAsset = {
    amount: string;
    tokenAddress: string;
    assetType: AssetType;
};

export type TACCallParams = {
    arguments: string;
    methodName: string;
    target: string;
};

export type TACSimulationParams = {
    tacCallParams: TACCallParams;
    evmValidExecutors?: string[];
    tvmValidExecutors?: string[];
    extraData?: string;
    shardsKey: string;
    tonAssets: TONAsset[];
    tonCaller: string;
    calculateRollbackFee?: boolean;
};

export enum StageName {
    COLLECTED_IN_TAC = 'collectedInTAC',
    INCLUDED_IN_TAC_CONSENSUS = 'includedInTACConsensus',
    EXECUTED_IN_TAC = 'executedInTAC',
    COLLECTED_IN_TON = 'collectedInTON',
    INCLUDED_IN_TON_CONSENSUS = 'includedInTONConsensus',
    EXECUTED_IN_TON = 'executedInTON',
}

export type TransactionData = {
    hash: string;
    blockchainType: BlockchainType;
};

export type NoteInfo = {
    content: string;
    errorName: string;
    internalMsg: string;
    internalBytesError: string;
};

export type StageData = {
    success: boolean;
    timestamp: number;
    transactions: TransactionData[] | null;
    note: NoteInfo | null;
};

export type StatusInfo = StageData & {
    stage: StageName;
};

export type ProfilingStageData = {
    exists: boolean;
    stageData: StageData | null;
};

export type InitialCallerInfo = {
    address: string;
    blockchainType: BlockchainType;
};

export type ValidExecutors = {
    tac: string[];
    ton: string[];
};

export enum TokenSymbol {
    TAC_SYMBOL = 'TAC',
    TON_SYMBOL = 'TON',
}

export type GeneralFeeInfo = {
    protocolFee: string;
    executorFee: string;
    tokenFeeSymbol: TokenSymbol;
};

export type AdditionalFeeInfo = {
    attachedProtocolFee: string;
    tokenFeeSymbol: TokenSymbol;
};

export type FeeInfo = {
    additionalFeeInfo: AdditionalFeeInfo;
    tac: GeneralFeeInfo;
    ton: GeneralFeeInfo;
};

export type AssetMovement = {
    assetType: AssetType;
    tvmAddress: string;
    evmAddress: string;
    amount: string;
    tokenId: string | null;
};

export type TransactionHash = {
    hash: string;
    blockchainType: BlockchainType;
};

export type AssetMovementInfo = {
    caller: InitialCallerInfo;
    target: InitialCallerInfo;
    transactionHash: TransactionHash;
    assetMovements: AssetMovement[];
};

export type MetaInfo = {
    initialCaller: InitialCallerInfo;
    validExecutors: ValidExecutors;
    feeInfo: FeeInfo;
    sentAssets: AssetMovementInfo | null;
    receivedAssets: AssetMovementInfo | null;
};

export type ExecutionStages = {
    operationType: OperationType;
    metaInfo: MetaInfo;
} & Record<StageName, ProfilingStageData>;

export type ExecutionStagesByOperationId = Record<string, ExecutionStages>;

export type StatusInfosByOperationId = Record<string, StatusInfo>;

export type OperationIds = {
    operationIds: string[];
};

export type OperationIdsByShardsKey = Record<string, OperationIds>;

export type TACSimulationResult = {
    estimatedGas: bigint;
    feeParams: {
        currentBaseFee: string;
        isEip1559: boolean;
        suggestedGasPrice: string;
        suggestedGasTip: string;
    };
    message: string;
    outMessages:
        | {
              callerAddress: string;
              operationId: string;
              payload: string;
              queryId: number;
              targetAddress: string;
              tokensBurned: {
                  amount: string;
                  tokenAddress: string;
              }[];
              tokensLocked: {
                  amount: string;
                  tokenAddress: string;
              }[];
              nftBurned: {
                  amount: string;
                  tokenAddress: string;
              }[];
              nftLocked: {
                  amount: string;
                  tokenAddress: string;
              }[];
          }[]
        | null;
    simulationError: string;
    simulationStatus: boolean;
    suggestedTonExecutionFee: string;
    suggestedTacExecutionFee: string;
    debugInfo: {
        from: string;
        to: string;
        callData: string;
        blockNumber: number;
    };
};

export type SuggestedTVMExecutorFee = {
    inTAC: string;
    inTON: string;
};

export type FeeParams = {
    isRoundTrip: boolean;
    gasLimit: bigint;
    protocolFee: bigint;
    evmExecutorFee: bigint;
    tvmExecutorFee: bigint;
};

export type CrossChainTransactionOptions = {
    allowSimulationError?: boolean;
    isRoundTrip?: boolean;
    protocolFee?: bigint;
    evmValidExecutors?: string[];
    evmExecutorFee?: bigint;
    tvmValidExecutors?: string[];
    tvmExecutorFee?: bigint;
    calculateRollbackFee?: boolean;
    withoutSimulation?: boolean;
    validateAssetsBalance?: boolean;
    waitOperationId?: boolean;
    waitOptions?: WaitOptions<string>;
};

export type BatchCrossChainTransactionOptions = Omit<CrossChainTransactionOptions, 'waitOperationId' | 'waitOptions'>;

export type CrossChainTransactionsOptions = {
    waitOperationIds?: boolean;
    waitOptions?: WaitOptions<OperationIdsByShardsKey>;
};

export type ExecutionFeeEstimationResult = {
    feeParams: FeeParams;
    simulation?: TACSimulationResult;
};

export type CrosschainTx = {
    evmProxyMsg: EvmProxyMsg;
    assets?: Asset[];
    options?: CrossChainTransactionOptions;
};

export type BatchCrossChainTx = {
    evmProxyMsg: EvmProxyMsg;
    assets?: Asset[];
    options?: BatchCrossChainTransactionOptions;
};

export type AssetLike =
    | Asset
    | FT
    | NFT
    | { rawAmount: bigint }
    | { amount: number }
    | { address: TVMAddress | EVMAddress }
    | { address: TVMAddress | EVMAddress; rawAmount: bigint }
    | { address: TVMAddress | EVMAddress; amount: number }
    | { address: TVMAddress | EVMAddress; itemIndex: bigint };

export type BatchCrossChainTxWithAssetLike = Omit<BatchCrossChainTx, 'assets'> & { assets?: AssetLike[] };

export interface WaitOptions<T = unknown, TContext = unknown> {
    /**
     * Timeout in milliseconds
     * @default 300000 (5 minutes)
     */
    timeout?: number;
    /**
     * Maximum number of attempts
     * @default 30
     */
    maxAttempts?: number;
    /**
     * Delay between attempts in milliseconds
     * @default 10000 (10 seconds)
     */
    delay?: number;
    /**
     * Logger
     */
    logger?: ILogger;
    /**
     * Optional context object to pass additional parameters to callbacks
     * This allows passing custom data like OperationTracker instances, configurations, etc.
     */
    context?: TContext;
    /**
     * Function to check if the result is successful
     * If not provided, any non-error result is considered successful
     */
    successCheck?: (result: T, context?: TContext) => boolean;
    /**
     * Custom callback function that executes when request is successful
     * Receives both the result and optional context with additional parameters
     */
    onSuccess?: (result: T, context?: TContext) => Promise<void> | void;
}

export const defaultWaitOptions: WaitOptions = {
    timeout: 300000,
    maxAttempts: 30,
    delay: 10000,
};

export enum Origin {
    TON = 'TON',
    TAC = 'TAC',
}

export type TVMAddress = string;
export type EVMAddress = string;

// Arguments for creating Asset instances via AssetFactory
export type AssetFromFTArg = {
    address: TVMAddress | EVMAddress;
    tokenType: AssetType.FT;
};

export type AssetFromNFTCollectionArg = {
    address: TVMAddress | EVMAddress;
    tokenType: AssetType.NFT;
    addressType: NFTAddressType.COLLECTION;
    index: bigint;
};

export type AssetFromNFTItemArg = {
    address: TVMAddress;
    tokenType: AssetType.NFT;
    addressType: NFTAddressType.ITEM;
};

export type ConvertCurrencyParams = {
    value: bigint;
    currency: CurrencyType;
};

export type USDPriceInfo = {
    spot: bigint;
    ema: bigint;
    decimals: number;
};

export type ConvertedCurrencyResult = {
    spotValue: bigint;
    emaValue: bigint;
    decimals: number;
    currency: CurrencyType;
    tacPrice: USDPriceInfo;
    tonPrice: USDPriceInfo;
};

export type GetTVMExecutorFeeParams = {
    feeSymbol: string;
    tonAssets: TONAsset[];
    tvmValidExecutors: string[];
};

export type FTOriginAndData = {
    origin: Origin;
    jettonMinter: OpenedContract<JettonMinter> | SandboxContract<JettonMinter>;
    evmAddress?: string;
    jettonData?: JettonMinterData;
};
