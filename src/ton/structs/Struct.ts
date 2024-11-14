import { Cell } from '@ton/ton';
import type { TonClientParameters } from '@ton/ton';

export const enum Network {
    Testnet = 'testnet',
    Mainnet = 'mainnet'
}

export const enum OpCode {
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

export type JettonTransferData = {
    fromAddress: string,
    tokenAddress: string,
    jettonAmount: number,
    tonAmount?: number
}

export type EvmProxyMsg = {
    evmTargetAddress: string,
    methodName: string
    encodedParameters: string,
}

export type TransactionLinker = {
    caller: string,
    queryId: number,
    shardCount: number,
    shardedId: string,
    timestamp: number,
}

export type TransferMessage = {
    address: string,
    value: string,
    payload: Cell,
}

export type ShardTransaction = {
    validUntil: number,
    messages: TransferMessage[],
    network: Network,
}
