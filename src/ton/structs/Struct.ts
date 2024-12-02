import {Cell} from '@ton/ton';
import type {TonClientParameters} from '@ton/ton';

export enum Network {
    Testnet = 'testnet',
    Mainnet = 'mainnet'
}

export enum SimplifiedStatuses {
    Pending,
    Failed,
    Successful,
    OperationIdNotFound,
}

export type TacSDKTonClientParams = {
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
}


export type AssetOperationGeneralData = {
    amount: number
    address?: string
}

export type JettonOperationGeneralData = AssetOperationGeneralData & {
    address: string
}

export type JettonTransferData = JettonOperationGeneralData;

export type JettonBurnData = JettonOperationGeneralData & {
    notificationReceiverAddress: string,
}

export type EvmProxyMsg = {
    evmTargetAddress: string,
    methodName: string,
    encodedParameters: string,
}

export type TransactionLinker = {
    caller: string,
    shardCount: number,
    shardedId: string,
    timestamp: number,
}

export type ShardMessage = {
    address: string,
    value: number,
    payload: Cell,
}

export type ShardTransaction = {
    validUntil: number,
    messages: ShardMessage[],
    network: Network,
}

export enum AssetOpType {
    JettonBurn = 'JettonBurn',
    JettonTransfer = 'JettonTransfer'
}
