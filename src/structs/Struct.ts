import { SandboxContract } from '@ton/sandbox';
import type { Address, Contract, OpenedContract } from '@ton/ton';
import { AbstractProvider, Addressable, Interface, InterfaceAbi } from 'ethers';

export interface ContractOpener {
    open<T extends Contract>(src: T): OpenedContract<T> | SandboxContract<T>;

    getContractState(address: Address): Promise<{
        balance: bigint;
        state: 'active' | 'uninitialized' | 'frozen';
        code: Buffer | null;
    }>;

    closeConnections?: () => unknown;
}

export enum SimplifiedStatuses {
    Pending,
    Failed,
    Successful,
    OperationIdNotFound,
}

export enum Network {
    Testnet = 'testnet',
    Mainnet = 'mainnet',
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

export type WithAddress = {
    /**
     * Address of TAC or TON token.
     * Empty if sending native TON coin.
     */
    address?: string;
};

export type RawAssetBridgingData = {
    /** Raw format, e.g. 12340000000 (=12.34 tokens if decimals is 9) */
    rawAmount: bigint;
} & WithAddress;

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

export type EVMSimulationRequest = {
    evmCallParams: {
        arguments: string;
        methodName: string;
        target: string;
    };
    extraData: string;
    feeAssetAddress: string;
    shardsKey: number;
    tvmAssets: {
        amount: string;
        tokenAddress: string;
    }[];
    tvmCaller: string;
};

export type StatusByOperationId = Record<string, {
    status_name: string;
    exists: boolean;
    error: string | null;
    info: {
        success: boolean;
        timestamp: number;
        transaction_hash: string;
        note: {
            content: string;
            error_name: string;
            internal_msg: string;
            internal_bytes_error: string;
        };
    };
}>;

export type EVMSimulationResults = {
    estimatedGas: bigint;
    estimatedJettonFeeAmount: string;
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
          }[]
        | null;
    simulationError: string;
    simulationStatus: boolean;
    debugInfo: {
        from: string;
        to: string;
        callData: string;
        blockNumber: number;
    };
};
