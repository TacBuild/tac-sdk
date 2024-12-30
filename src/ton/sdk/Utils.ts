import { Address, beginCell, Cell, storeStateInit } from '@ton/ton';
import { AbiCoder, ethers, isAddress } from 'ethers';

import { EvmProxyMsg, RandomNumberByTimestamp, TransactionLinker } from '../structs/Struct';
import { evmAddressError, tvmAddressError } from '../errors';

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function generateRandomNumber(interval: number): number {
    return Math.round(Math.random() * interval);
}

export function generateRandomNumberByTimestamp(): RandomNumberByTimestamp {
    const timestamp = Math.floor(+new Date() / 1000);

    return {
        timestamp,
        randomNumber: timestamp + generateRandomNumber(1000),
    };
}

export async function calculateContractAddress(code: Cell, data: Cell): Promise<Address> {
    const stateInit = beginCell().store(storeStateInit({ code, data })).endCell();
    return new Address(0, stateInit.hash());
}

export function buildEvmDataCell(transactionLinker: TransactionLinker, evmProxyMsg: EvmProxyMsg): Cell {
    const evmArguments = evmProxyMsg.encodedParameters
        ? Buffer.from(evmProxyMsg.encodedParameters.split('0x')[1], 'hex').toString('base64')
        : null;

    const json = JSON.stringify({
        evm_call: {
            target: evmProxyMsg.evmTargetAddress,
            method_name: evmProxyMsg.methodName ?? '',
            arguments: evmArguments,
        },
        sharded_id: transactionLinker.shardedId,
        shard_count: transactionLinker.shardCount,
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
    try {
        Address.parse(address); // will throw on error address
    } catch {
        throw tvmAddressError(address);
    }
}

export function validateEVMAddress(address: string): void {
    if (!isAddress(address)) {
        throw evmAddressError(address);
    }
}

export function calculateEVMTokenAddress(
    abiCoder: AbiCoder,
    crossChainLayerAddress: string,
    crossChainLayerBytecode: string,
    settingsAddress: string,
    l1Address: string,
): string {
    const salt = ethers.keccak256(ethers.solidityPacked(['string'], [l1Address]));
    const initCode = ethers.solidityPacked(
        ['bytes', 'bytes'],
        [crossChainLayerBytecode, abiCoder.encode(['address'], [settingsAddress])],
    );
    const initCodeHash = ethers.keccak256(initCode);
    return ethers.getCreate2Address(crossChainLayerAddress, salt, initCodeHash);
}
