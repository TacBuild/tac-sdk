import type {EvmProxyMsg, JettonOperationGeneralData, TransactionLinker} from "../structs/Struct";
import {Address, beginCell, Cell, storeStateInit} from "@ton/ton";

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function generateQueryId(): number {
    const timestamp = Math.floor(+new Date() / 1000);
    const randAppend = Math.round(Math.random() * 1000);
    return timestamp + randAppend;
}

export async function calculateContractAddress(code: Cell, data: Cell): Promise<Address> {
    const stateInit = beginCell().store(storeStateInit({code, data})).endCell();
    return new Address(0, stateInit.hash());
}

export function buildEvmArgumentsCell(transactionLinker: TransactionLinker, evmProxyMsg: EvmProxyMsg): Cell {
    const evmArguments = Buffer.from(evmProxyMsg.encodedParameters.split('0x')[1], 'hex').toString('base64');

    const json = JSON.stringify({
        evm_call: {
            target: evmProxyMsg.evmTargetAddress,
            method_name: evmProxyMsg.methodName,
            arguments: evmArguments
        },
        sharded_id: transactionLinker.shardedId,
        shard_count: transactionLinker.shardCount
    });

    return beginCell().storeStringTail(json).endCell();
}

export function generateTransactionLinker(caller: string, shardCount: number): TransactionLinker {
    const timestamp = Math.floor(+new Date() / 1000);
    const shardedId = String(timestamp + Math.round(Math.random() * 1000));

    return {
        caller: Address.normalize(caller),
        shardCount,
        shardedId,
        timestamp
    };
}

export function validateTVMAddress(address: string): void {
    if (!Address.isAddress(address)) {
        throw new Error('invalid tvm address');
    }
}