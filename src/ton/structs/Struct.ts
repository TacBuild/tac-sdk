import { SandboxContract } from '@ton/sandbox';
import type { Address, Contract, OpenedContract, TonClientParameters } from '@ton/ton';
import { Cell } from '@ton/ton';

export interface ContractOpener {
    open<T extends Contract>(src: T): OpenedContract<T> | SandboxContract<T>;
    getContractState(address: Address): Promise<{
        balance: bigint;
        state: 'active' | 'uninitialized' | 'frozen';
        code: Buffer | null;
    }>;
}

export enum Network {
    Testnet = 'testnet',
    Mainnet = 'mainnet',
}

export enum SimplifiedStatuses {
    Pending,
    Failed,
    Successful,
    OperationIdNotFound,
}

export type TacSDKTonClientParams = {
    /**
     * Provider to use instead of @ton/ton TonClient
     */
    contractOpener?: ContractOpener;

    /**
     * TON CHAIN
     */
    network: Network;

    /**
     * TonClient Parameters
     */
    tonClientParameters?: TonClientParameters;

    /**
     * Delay in request to TONClient
     */
    delay?: number;

    /**
     * Custom address of tvm settings contract. Use only for tests.
     */
    settingsAddress?: string;
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
