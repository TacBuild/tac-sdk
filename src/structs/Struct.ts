import { SandboxContract } from '@ton/sandbox';
import { Cell, OpenedContract } from '@ton/ton';
import { AbstractProvider } from 'ethers';

import { JettonMinter, JettonMinterData } from '../../artifacts/tonTypes';
import type { FT, NFT } from '../assets';
import type { Asset, ContractOpener, ILogger, IToncenterV3Indexer } from '../interfaces';
import { DEFAULT_WAIT_DELAY_MS, DEFAULT_WAIT_MAX_ATTEMPTS, DEFAULT_WAIT_TIMEOUT_MS } from '../sdk/Consts';
import { SendResult } from './InternalStruct';

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

export type OperationTypeV2 = OperationType.TON_TAC_TON | OperationType.TON_TAC | OperationType.TAC_TON;

export enum OperationExecutionStatus {
    SUCCESS = 'success',
    FAILED = 'failed',
}

export type TACParams = {
    /**
     * Provider for TAC side. Use your own provider for tests or to increase ratelimit
     */
    provider?: AbstractProvider;

    /**
     * Address of TAC settings contract. Use only for tests.
     */
    settingsAddress?: string;

    /**
     * Address of TAC smart account factory contract. Use only for tests.
     */
    saFactoryAddress?: string;
};

export type TONParams = {
    /**
     * Provider for TON side. Use your own provider for tests or to increase ratelimit
     */
    contractOpener?: ContractOpener;

    /**
     * Indexed Toncenter v3 client used to resolve TON transaction context by hash.
     * Use your own implementation for tests or custom indexed backends.
     */
    tonIndexer?: IToncenterV3Indexer;

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

    /**
     * Whether SDK logger should be passed to TON contract opener(s).
     * Default: true
     */
    passLoggerToOpeners?: boolean;
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
};

export type TransactionLinker = {
    caller: string;
    shardCount: number;
    shardsKey: string;
    timestamp: number;
    sendTransactionResult?: SendResult;
};

export type TransactionLinkerWithOperationId = TransactionLinker & {
    operationId?: string;
};

export type TACCrossChainTransactionResult = {
    /**
     * Hash of the TAC transaction
     */
    txHash: string;
    /**
     * Crosschain operation id
     */
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

/**
 * Indexed transaction returned by Toncenter v3 `/transactions` and `/adjacentTransactions` endpoints.
 */
export type ToncenterV3IndexedTransaction = {
    /** Account address that owns the transaction. */
    account: string;
    /** Indexed TON transaction hash. */
    hash: string;
    /** Optional trace identifier returned by Toncenter v3. */
    traceId?: string;
    /** Incoming message of the indexed transaction, when present in the response. */
    inMsg?: {
        /** Message source address. */
        source?: string | null;
        /** Message destination address. */
        destination?: string | null;
        /** Opcode reported by Toncenter v3 for the incoming message. */
        opcode?: string | null;
        /** Raw message content returned by Toncenter v3. */
        messageContent?: {
            /** BOC-encoded message body in base64 form. */
            body?: string | null;
        } | null;
    } | null;
    /** Outgoing messages of the indexed transaction. */
    outMsgs: Array<{
        /** Message destination address. `null` means external outbound log message. */
        destination?: string | null;
        /** Raw message content returned by Toncenter v3. */
        messageContent?: {
            /** BOC-encoded message body in base64 form. */
            body?: string | null;
        } | null;
    }>;
};

/**
 * Traversal settings for indexed search through a linked TON transaction chain in Toncenter v3.
 */
export type ToncenterV3TraversalParams = {
    /**
     * Maximum traversal depth from the starting transaction in the linked TON transaction chain.
     */
    maxDepth?: number;

    /**
     * Maximum number of unique indexed transactions to inspect.
     */
    maxScannedTransactions?: number;
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

export type OperationTypeV2Info = {
    operationType: OperationTypeV2;
    finalized: boolean;
};

export type ExecutionStagesV2 = {
    operationType: OperationTypeV2;
    metaInfo: MetaInfo;
    finalized: boolean;
    status: OperationExecutionStatus;
    rollback: boolean;
} & Record<StageName, ProfilingStageData>;

export type ExecutionStagesByOperationId = Record<string, ExecutionStages>;
export type ExecutionStagesV2ByOperationId = Record<string, ExecutionStagesV2>;

export type StatusInfosByOperationId = Record<string, StatusInfo>;

export type OperationIds = {
    operationIds: string[];
};

export type OperationIdWithLogIndex = {
    operationId: string;
    logIndex: number;
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
    evmEstimatedGas?: bigint;
};

export type evmDataBuilder = (
    transactionLinker: TransactionLinker,
    evmProxyMsg: EvmProxyMsg,
    validExecutors: ValidExecutors,
) => Cell;

export type CrossChainTransactionOptions = {
    /**
     * Allows sending to continue even when TAC simulation returns an unsuccessful result.
     * @default false
     */
    allowSimulationError?: boolean;
    /**
     * If true, validates the initial TON transaction tree right after sending the external message.
     * This checks that the outbound TON transaction was actually executed before the SDK starts
     * waiting for cross-chain tracking data.
     * @default true
     */
    ensureTxExecuted?: boolean;
    /**
     * If true, validates explicitly provided fee params against suggested values.
     * Disable only when you intentionally want to send with custom fees.
     * @default true
     */
    shouldValidateFees?: boolean;
    /**
     * Forces the SDK to treat the operation as round-trip TON -> TAC -> TON.
     * When omitted, the SDK derives this automatically from simulation results and attached assets.
     */
    isRoundTrip?: boolean;
    /**
     * Explicit override for the protocol fee included in the transaction.
     * Normally this is taken from simulation or on-chain configuration.
     */
    protocolFee?: bigint;
    /**
     * Optional whitelist of TAC-side executor addresses allowed to execute the TAC part of the operation.
     * When omitted, trusted executors from SDK configuration are used.
     */
    evmValidExecutors?: string[];
    /**
     * Explicit fee paid to the TAC-side executor.
     * Normally this is filled from simulation unless you provide custom manual fee params.
     */
    evmExecutorFee?: bigint;
    /**
     * Optional whitelist of TON-side executor addresses allowed to execute the TON part of the operation.
     * When omitted, trusted executors from SDK configuration are used.
     */
    tvmValidExecutors?: string[];
    /**
     * Explicit fee paid to the TON-side executor for round-trip operations.
     * Required in manual mode when `withoutSimulation` is true and `isRoundTrip` is true.
     */
    tvmExecutorFee?: bigint;
    /**
     * Controls whether rollback fee should be included in TAC simulation.
     * Keep enabled unless you intentionally want estimation without rollback costs.
     * @default true
     */
    calculateRollbackFee?: boolean;
    /**
     * Skips simulation entirely and uses only manually provided fee params.
     * In this mode you must provide `protocolFee`, `evmExecutorFee`, and `evmProxyMsg.gasLimit`.
     * If `isRoundTrip` is true, `tvmExecutorFee` is also required.
     * @default false
     */
    withoutSimulation?: boolean;
    /**
     * If true, validates that the sender currently owns or holds enough assets before building
     * the cross-chain transaction payloads.
     * Disable only if you already validated balances externally or need to skip this network call.
     * @default true
     */
    validateAssetsBalance?: boolean;
    /**
     * If true, waits until the operation ID becomes available after sending the TON transaction.
     * Disable when you only need the raw send result and do not want any tracker polling.
     * @default true
     */
    waitOperationId?: boolean;
    /**
     * Retry policy used while resolving the operation ID.
     * Use this to control timeout, attempts, delay, logger, callbacks, and success criteria.
     */
    waitOptions?: WaitOptions<string>;
    /**
     * If true, waits for full cross-chain finalization after the operation ID is known:
     * the SDK waits for a final operation type, fetches stage profiling, and validates
     * TON transaction trees for `executedInTON` transactions when they exist.
     * @default true
     */
    waitFinalization?: boolean;
    /**
     * Wait options used to finalize the cross-chain operation after operationId resolution.
     * Use this to configure retries, delay, logger, successCheck, and onSuccess callback
     * for stage profiling retrieval and post-processing.
     */
    finalizationWaitOptions?: WaitOptions<ExecutionStages>;
    /**
     * Custom builder for the EVM payload cell embedded into the TON message.
     * Override only for advanced integrations that need non-standard TAC header encoding.
     * By default the SDK uses `buildEvmDataCell`.
     */
    evmDataBuilder?: evmDataBuilder;
};

export type BatchCrossChainTransactionOptions = Omit<
    CrossChainTransactionOptions,
    'waitOperationId' | 'waitOptions' | 'ensureTxExecuted' | 'waitFinalization' | 'finalizationWaitOptions'
>;

export type CrossChainTransactionsOptions = {
    waitOperationIds?: boolean;
    waitOptions?: WaitOptions<OperationIdsByShardsKey>;
};

export type CrossChainTransactionToTONOptions = {
    /**
     * Optional explicit TON-side executor fee.
     * When omitted, the SDK calls OperationTracker.getTVMExecutorFee().
     */
    tvmExecutorFee?: bigint;
    /**
     * Optional whitelist of allowed TVM executors.
     * Used both for fee estimation and for the out message itself.
     */
    tvmValidExecutors?: string[];
    /**
     * If true, validates balances / ownership of non-native TAC assets before approvals and sending.
     * Native TAC amount is still covered separately by the overall TAC balance sufficiency check.
     * Disable only if you already validated balances externally or need to skip these RPC calls.
     * @default true
     */
    validateAssetsBalance?: boolean;
    /**
     * If true, waits until the operation ID becomes available after sending the TON transaction.
     * Disable when you only need the raw send result and do not want any tracker polling.
     * @default true
     */
    waitOperationId?: boolean;
    /**
     * Retry policy used while resolving the operation ID.
     * Use this to control timeout, attempts, delay, logger, callbacks, and success criteria.
     */
    waitOptions?: WaitOptions<string>;
    /**
     * Wait options used to finalize the cross-chain operation after operationId resolution.
     * Use this to configure retries, delay, logger, successCheck, and onSuccess callback
     * for stage profiling retrieval and post-processing.
     */
    waitFinalization?: boolean;
    /**
     * Wait options used to finalize the TAC->TON operation after operationId resolution.
     * The SDK waits until the operation reaches a final operation type, fetches stage profiling,
     * and, if profiling contains EXECUTED_IN_TON transactions, validates their TON transaction tree.
     * This option is used only by sendCrossChainTransactionToTON and is ignored by bridgeTokensToTON.
     */
    finalizationWaitOptions?: WaitOptions<ExecutionStages>;
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
     * @default 30000 (5 minutes)
     */
    timeout?: number;
    /**
     * Maximum number of attempts
     * @default 10
     */
    maxAttempts?: number;
    /**
     * Delay between attempts in milliseconds
     * @default 1000 (1 seconds)
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
    /**
     * Include underlying error stack trace in FetchError (innerStack)
     * @default false
     */
    includeErrorTrace?: boolean;
}

export const defaultWaitOptions: WaitOptions = {
    timeout: DEFAULT_WAIT_TIMEOUT_MS,
    maxAttempts: DEFAULT_WAIT_MAX_ATTEMPTS,
    delay: DEFAULT_WAIT_DELAY_MS,
};

export enum Origin {
    TON = 'TON',
    TAC = 'TAC',
}

export enum AssetFeeMode {
    TAC_ORIGINAL = 'TAC_ORIGINAL',
    LEGACY = 'LEGACY',
    DYNAMIC = 'DYNAMIC',
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

export type CrossChainPayloadResult = {
    body: Cell;
    destinationAddress: string;
    tonAmount: bigint;
    tonNetworkFee: bigint;
    tacEstimatedGas?: bigint;
    transactionLinker: TransactionLinker;
};

export type GeneratePayloadParams = {
    excessReceiver: string;
    evmData: Cell;
    crossChainTonAmount?: bigint;
    forwardFeeTonAmount?: bigint;
    feeParams?: FeeParams;
};

export type TacGasPrice = {
    average: number;
    fast: number;
    slow: number;
};

export enum TransactionTreeDirection {
    FORWARD = 'forward',
    BACKWARD = 'backward',
    BOTH = 'both',
}

/**
 * Parameters for tracking and validating transaction trees
 */
export type TrackTransactionTreeParams = {
    /**
     * Maximum number of transactions to fetch per pagination request
     * @default 100
     */
    limit?: number;

    /**
     * Maximum depth to traverse in the transaction tree, inclusive (prevents infinite loops)
     * @default 10
     */
    maxDepth?: number;

    /**
     * Maximum number of transactions to scan while searching by hash in account history.
     * Prevents excessive full-history scans on high-activity accounts.
     * @default 100
     */
    maxScannedTransactions?: number;

    /**
     * Whether to search archival nodes for historical data.
     * Omitted by default; set true for old transactions when the provider has archival nodes.
     */
    archival?: boolean;

    /**
     * Logical time of the root transaction. Use with a root transaction hash to avoid scanning from latest history.
     */
    rootLt?: string;

    /**
     * List of operation codes (opcodes) to skip for extra checks.
     * Core phase validation is still applied.
     * @default [ 0xd53276db ] // Excess
     */
    ignoreOpcodeList?: number[];

    /**
     * Direction to search the transaction tree:
     * - 'forward': only search children (outgoing messages)
     * - 'backward': only search parents (incoming messages)
     * - 'both': search in both directions
     * @default 'forward'
     */
    direction?: TransactionTreeDirection;

    /**
     * Retry transaction lookup when `not_found` error occurs.
     * Useful when transaction indexing has delays or when transactions appear gradually.
     * @default true
     */
    retryOnNotFound?: boolean;

    /**
     * Delay in milliseconds between retry attempts for transaction lookup
     * @default 5000
     */
    retryDelayMs?: number;

    /**
     * Number of retry attempts for transaction lookup
     * @default 10
     */
    retries?: number;
};

/**
 * Details about a transaction validation error
 */
export type TransactionValidationError = {
    /**
     * Base64-encoded hash of the failed transaction (or the searched hash if not found)
     */
    txHash: string;

    /**
     * Exit code from the compute phase, or 'N/A' if compute phase is missing
     */
    exitCode: number | 'N/A';

    /**
     * Result code from the action phase, or 'N/A' if action phase is missing
     */
    resultCode: number | 'N/A';

    /**
     * Reason for validation failure:
     * - 'aborted': default: transaction was aborted
     * - 'compute_phase_missing': compute phase is missing
     * - 'compute_phase_failed': compute phase failed (exitCode !== 0)
     * - 'action_phase_failed': action phase failed (resultCode !== 0)
     * - 'not_found': transaction or message hash not found during traversal
     */
    reason: 'aborted' | 'compute_phase_missing' | 'compute_phase_failed' | 'action_phase_failed' | 'not_found';

    /**
     * Address where the lookup was performed (for reason: 'not_found')
     */
    address?: string;

    /**
     * Hash type used in lookup (for reason: 'not_found')
     */
    hashType?: 'unknown' | 'in' | 'out';
};

/**
 * Result of transaction tree tracking and validation
 */
export type TrackTransactionTreeResult = {
    /**
     * Whether all transactions in the tree passed validation
     */
    success: boolean;

    /**
     * Count of unique transactions checked during traversal
     */
    checkedCount?: number;

    /**
     * Details about the first validation error encountered (if any)
     */
    error?: TransactionValidationError;
};

export type GetTransactionsOptions = {
    /** Maximum number of transactions to retrieve */
    limit?: number;
    /** Logical time of the transaction to start from */
    lt?: string;
    /** Hash of the transaction to start from */
    hash?: string;
    /** Logical time of the transaction to end at */
    to_lt?: string;
    /** Whether to include the starting transaction in the results */
    inclusive?: boolean;
    /** Whether to search in archival nodes for historical data */
    archival?: boolean;
    /** Request timeout in milliseconds */
    timeoutMs?: number;
    /** Delay between retry attempts in milliseconds */
    retryDelayMs?: number;
    /** Number of retry attempts */
    retries?: number;
    /** Internal scan guard: maximum transactions to inspect while traversing history */
    maxScannedTransactions?: number;
};

export type AddressInformation = {
    /** Information about the last transaction of the address */
    lastTransaction: {
        /** Logical time of the last transaction */
        lt: string;
        /** Hash of the last transaction */
        hash: string;
    };
};
