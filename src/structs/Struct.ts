import { SandboxContract } from '@ton/sandbox';
import type { Address, Contract, OpenedContract } from '@ton/ton';
import { Cell } from '@ton/ton';
import { AbstractProvider, Addressable, ethers, Interface, InterfaceAbi } from 'ethers';

export interface ContractOpener {
    open<T extends Contract>(src: T): OpenedContract<T> | SandboxContract<T>;

    getContractState(address: Address): Promise<{
        balance: bigint;
        state: 'active' | 'uninitialized' | 'frozen';
        code: Buffer | null;
    }>;
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
}

export type TONParams = {
    /**
     * Provider for TON side. Use your own provider for tests or to increase ratelimit
     */
    contractOpener?: ContractOpener;

    /**
     * Address of TON settings contract. Use only for tests.
     */
    settingsAddress?: string;
}

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

export type InternalTONParams = {
    contractOpener: ContractOpener;
    jettonProxyAddress: string;
    crossChainLayerAddress: string;
    jettonMinterCode: Cell;
    jettonWalletCode: Cell;
};

export type InternalTACParams = {
    provider: AbstractProvider;
    settingsAddress: string,
    abiCoder: ethers.AbiCoder,
    crossChainLayerABI: Interface | InterfaceAbi,
    crossChainLayerAddress: string,
    crossChainLayerTokenABI: Interface | InterfaceAbi,
    crossChainLayerTokenBytecode: string,
};

export type AssetBridgingData = {
    amount: number;
    address?: string;
};

export type JettonBridgingData = AssetBridgingData & {
    address: string;
};

export type JettonTransferData = JettonBridgingData;

export type JettonBurnData = JettonBridgingData & {
    notificationReceiverAddress: string;
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

export type ShardMessage = {
    address: string;
    value: number;
    payload: Cell;
};

export type ShardTransaction = {
    validUntil: number;
    messages: ShardMessage[];
    network: Network;
};

export enum AssetOpType {
    JettonBurn = 'JettonBurn',
    JettonTransfer = 'JettonTransfer',
}

export type RandomNumberByTimestamp = {
    timestamp: number;
    randomNumber: number;
};
