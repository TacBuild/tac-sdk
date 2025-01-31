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
};

export type AssetBridgingData = {
    amount: number | bigint;
    /**
     * Address of TAC or TON token.
     * Empty if sending native TON coin.
     */
    address?: string;
};

export type EvmProxyMsg = {
    evmTargetAddress: string;
    methodName?: string;
    encodedParameters?: string;
};

export type TransactionLinker = {
    caller: string;
    shardCount: number;
    shardedId: string;
    timestamp: number;
    sendTransactionResult?: unknown;
};

export type StatusByOperationId = { operationId: string; errorMessage: string | null; status: string }

export type ResponseBase<T> = { response: T };

export type StatusesResponse = ResponseBase<StatusByOperationId[]>;
