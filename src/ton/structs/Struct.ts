import { Cell } from '@ton/ton';
import type { TonClientParameters } from '@ton/ton';

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

export enum OpCode {
    JettonTransfer = 0xF8A7EA5,
}

export type TacSDKTonClientParams = {
    /**
     * TonClient Parameters
     */
    tonClientParameters?: TonClientParameters;

    /**
     * TON CHAIN
     */
    network?: Network;

    /**
     * Delay in request to TONClient
     */
    delay?: number;
}

export type JettonOpGeneralData = {
    fromAddress: string,
    tokenAddress: string,
    jettonAmount: number;
    tonAmount?: number
}

export type JettonTransferData = JettonOpGeneralData;

export type JettonBurnData = JettonOpGeneralData & {
    notificationReceieverAddress: string,
}

export type EvmProxyMsg = {
    evmTargetAddress: string,
    methodName: string,
    encodedParameters: string,
}

export type TransactionLinker = {
    caller: string,
    queryId: number,
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
