import {EvmProxyMsg, RandomNumberByTimestamp, TransactionLinker} from "../structs/Struct";
import {Address, beginCell, Cell, storeStateInit} from "@ton/ton";

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function generateRandomNumber(interval: number): number {
    return Math.round(Math.random() * interval);
}

export function generateRandomNumberByTimestamp(): RandomNumberByTimestamp {
    const timestamp = Math.floor(+new Date() / 1000);

     return {
         timestamp,
         randomNumber: timestamp + generateRandomNumber(1000)
     };
}

export async function calculateContractAddress(code: Cell, data: Cell): Promise<Address> {
    const stateInit = beginCell().store(storeStateInit({code, data})).endCell();
    return new Address(0, stateInit.hash());
}

export function buildEvmDataCell(transactionLinker: TransactionLinker, evmProxyMsg: EvmProxyMsg): Cell {
    const evmArguments = evmProxyMsg.encodedParameters ? Buffer.from(evmProxyMsg.encodedParameters.split('0x')[1], 'hex').toString('base64') : null;

    const json = JSON.stringify({
        evm_call: {
            target: evmProxyMsg.evmTargetAddress,
            method_name: evmProxyMsg.methodName ?? "",
            arguments: evmArguments
        },
        sharded_id: transactionLinker.shardedId,
        shard_count: transactionLinker.shardCount
    });

    return beginCell().storeStringTail(json).endCell();
}

export function generateTransactionLinker(caller: string, shardCount: number): TransactionLinker {
    const random = generateRandomNumberByTimestamp();

    return {
        caller: Address.normalize(caller),
        shardCount,
        shardedId: String(random.randomNumber),
        timestamp: random.timestamp,
    };
}

export function validateTVMAddress(address: string): void {
    if (!Address.isAddress(Address.parse((address)))) {
        throw new Error('invalid tvm address');
    }
}