import {TonClientParameters, Cell} from "@ton/ton";

export type TacSDKTonClientParams = {
    /**
     * TonClient Parameters
     */
    tonClientParameters?: TonClientParameters;

    /**
     * TON CHAIN
     */
    network?: number;
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
    query_id: number,
    shard_count: number,
    sharded_id: string,
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
    network: number,
}
