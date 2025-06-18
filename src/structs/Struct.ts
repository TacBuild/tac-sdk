import { SandboxContract } from '@ton/sandbox';
import type { Address, Cell, Contract, OpenedContract } from '@ton/ton';
import { AbstractProvider, Addressable, Interface, InterfaceAbi } from 'ethers';

export type ContractState = {
    balance: bigint;
    state: 'active' | 'uninitialized' | 'frozen';
    code: Buffer | null;
};

export interface ContractOpener {
    open<T extends Contract>(src: T): OpenedContract<T> | SandboxContract<T>;

    getContractState(address: Address): Promise<ContractState>;

    closeConnections?: () => unknown;
}

export enum SimplifiedStatuses {
    PENDING = 'PENDING',
    FAILED = 'FAILED',
    SUCCESSFUL = 'SUCCESSFUL',
    OPERATION_ID_NOT_FOUND = 'OPERATION_ID_NOT_FOUND',
}

export enum Network {
    TESTNET = 'testnet',
    MAINNET = 'mainnet',
}

export enum BlockchainType {
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

    /**
     * ABI of TAC settings contract. Use only for tests.
     */
    settingsABI?: Interface | InterfaceAbi;

    /**
     * ABI of TAC CCL contract. Use only for tests.
     */
    crossChainLayerABI?: Interface | InterfaceAbi;

    /**
     * ABI of TAC CrossChainLayerToken contract. Use only for tests.
     */
    crossChainLayerTokenABI?: Interface | InterfaceAbi;

    /**
     * bytecode of TAC CrossChainLayerToken contract. Use only for tests.
     */
    crossChainLayerTokenBytecode?: string;

    /**
     * ABI of TAC CrossChainLayerNFT contract. Use only for tests.
     */
    crossChainLayerNFTABI?: Interface | InterfaceAbi;

    /**
     * bytecode of TAC CrossChainLayerNFT contract. Use only for tests.
     */
    crossChainLayerNFTBytecode?: string;
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

    /**
     * Debug flag
     */
    debug?: boolean;
};

export enum AssetType {
    NFT = 'NFT',
    FT = 'FT',
}

export enum NFTAddressType {
    ITEM = 'ITEM',
    COLLECTION = 'COLLECTION',
}

export type WithAddressFT = {
    type: AssetType.FT;
    /**
     * Address of TAC or TON token.
     * Empty if sending native TON coin.
     */
    address?: string;
};

export type WithAddressNFTItem = {
    type: AssetType.NFT;
    /**
     * Address NFT item token.
     */
    address: string;
};

export type WithAddressNFTCollectionItem = {
    type: AssetType.NFT;
    /**
     * Address NFT collection.
     */
    collectionAddress: string;
    /**
     * Index of NFT item in collection.
     */
    itemIndex: bigint;
};

export type WithAddressNFT = WithAddressNFTItem | WithAddressNFTCollectionItem;

export type WithAddress = WithAddressFT | WithAddressNFT;

export type RawAssetBridgingData<NFTFormatRequired extends WithAddressNFT = WithAddressNFTItem> = {
    /** Raw format, e.g. 12340000000 (=12.34 tokens if decimals is 9) */
    rawAmount: bigint;
} & (WithAddressFT | NFTFormatRequired);

export type UserFriendlyAssetBridgingData = {
    /**
     * User friendly format, e.g. 12.34 tokens
     * Specified value will be converted automatically to raw format: 12.34 * (10^decimals).
     * No decimals should be specified.
     */
    amount: number;
    /**
     * Decimals may be specified manually.
     * Otherwise, SDK tries to extract them from chain.
     */
    decimals?: number;
} & WithAddress;

export type AssetBridgingData = RawAssetBridgingData | UserFriendlyAssetBridgingData;

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
    sendTransactionResult?: unknown;
};

export type TransactionLinkerWithOperationId = TransactionLinker & {
    operationId?: string;
};

export type TACSimulationRequest = {
    tacCallParams: {
        arguments: string;
        methodName: string;
        target: string;
    };
    evmValidExecutors: string[];
    extraData: string;
    shardsKey: string;

    tonAssets: {
        amount: string;
        tokenAddress: string;
        assetType: string;
    }[];
    tonCaller: string;
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

export type FeeInfo = {
    tac: GeneralFeeInfo;
    ton: GeneralFeeInfo;
};

export type MetaInfo = {
    initialCaller: InitialCallerInfo;
    validExecutors: ValidExecutors;
    feeInfo: FeeInfo;
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

export type SuggestedTONExecutorFee = {
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
    forceSend?: boolean;
    isRoundTrip?: boolean;
    protocolFee?: bigint;
    evmValidExecutors?: string[];
    evmExecutorFee?: bigint;
    tvmValidExecutors?: string[];
    tvmExecutorFee?: bigint;
};

export type ExecutionFeeEstimationResult = {
    feeParams: FeeParams;
    simulation: TACSimulationResult;
};

export type CrosschainTx = {
    evmProxyMsg: EvmProxyMsg;
    assets?: AssetBridgingData[];
    options?: CrossChainTransactionOptions;
};

export type NFTItemData = {
    init: boolean;
    index: number;
    collectionAddress: Address;
    ownerAddress: Address | null;
    content: Cell | null;
};

export interface WaitOptions<T = unknown> {
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
     * Function to log debug messages
     */
    log?: (message: string) => void;
    /**
     * Function to check if the result is successful
     * If not provided, any non-error result is considered successful
     */
    successCheck?: (result: T) => boolean;
}

export const defaultWaitOptions: WaitOptions = {
    timeout: 300000,
    maxAttempts: 30,
    delay: 10000,
};
