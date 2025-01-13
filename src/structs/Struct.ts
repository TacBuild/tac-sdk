import {SandboxContract} from '@ton/sandbox';
import type {Address, Contract, OpenedContract} from '@ton/ton';
import {Cell} from '@ton/ton';
import {AbstractProvider, ethers, Addressable, Interface, InterfaceAbi} from "ethers";
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
    provider: AbstractProvider;
    settingsAddress?: string
    settings: ethers.Contract,
    abiCoder: ethers.AbiCoder,
    crossChainLayerABI: Interface | InterfaceAbi,
    crossChainLayer?: ethers.Contract,
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
    
    jettonProxyAddress?: string;
    crossChainLayerAddress?: string;
    jettonMinterCode?: Cell;
    jettonWalletCode?: Cell;
}

export type SDKParams = {
    /**
     * TON CHAIN. For your network use Сustom
     */
    network: Network;

    /**
     * Delay in requests to provider
     */
    delay: number;


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
