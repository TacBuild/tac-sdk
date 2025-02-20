import { Address, beginCell, Cell, storeStateInit } from '@ton/ton';
import { AbiCoder, ethers, isAddress as isEthereumAddress } from 'ethers';

import { EvmProxyMsg, TransactionLinker } from '../structs/Struct';
import { RandomNumberByTimestamp } from '../structs/InternalStruct';
import { evmAddressError, invalidMethodNameError, tvmAddressError } from '../errors';
import { SOLIDITY_METHOD_NAME_REGEX, SOLIDITY_SIGNATURE_REGEX } from './Consts';

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
        evmCall: {
            target: evmProxyMsg.evmTargetAddress,
            methodName: formatSolidityMethodName(evmProxyMsg.methodName),
            arguments: evmArguments,
            gasLimit: Number(evmProxyMsg.gasLimit),
        },
        shardsKey: transactionLinker.shardsKey,
        shardCount: transactionLinker.shardCount,
    });

    return beginCell().storeStringTail(json).endCell();
}

export function formatSolidityMethodName(methodName?: string): string {
    if (!methodName) return '';

    if (!SOLIDITY_SIGNATURE_REGEX.test(methodName)) {
        throw invalidMethodNameError(methodName);
    }

    return SOLIDITY_METHOD_NAME_REGEX.test(methodName) ? `${methodName}(bytes,bytes)` : methodName;
}

export function generateTransactionLinker(caller: string, shardCount: number): TransactionLinker {
    const random = generateRandomNumberByTimestamp();

    return {
        caller: Address.normalize(caller),
        shardCount,
        shardsKey: String(random.randomNumber),
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
    if (!isEthereumAddress(address)) {
        throw evmAddressError(address);
    }
}

export function calculateEVMTokenAddress(
    abiCoder: AbiCoder,
    tokenUtilsAddress: string,
    crossChainLayerTokenBytecode: string,
    crossChainLayerAddress: string,
    l1Address: string,
): string {
    const salt = ethers.keccak256(ethers.solidityPacked(['string'], [l1Address]));
    const initCode = ethers.solidityPacked(
        ['bytes', 'bytes'],
        [crossChainLayerTokenBytecode, abiCoder.encode(['address'], [crossChainLayerAddress])],
    );
    const initCodeHash = ethers.keccak256(initCode);
    return ethers.getCreate2Address(tokenUtilsAddress, salt, initCodeHash);
}

const snakeToCamel = (str: string): string => str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());

export const convertKeysToCamelCase = <T>(data: T): T => {
    if (Array.isArray(data)) {
        return data.map(convertKeysToCamelCase) as T;
    } else if (data !== null && typeof data === 'object') {
        return Object.keys(data).reduce((acc, key) => {
            const camelKey = snakeToCamel(key);
            (acc as any)[camelKey] = convertKeysToCamelCase((data as any)[key]);
            return acc;
        }, {} as T);
    }
    return data;
};

export const calculateRawAmount = (amount: number, decimals: number): bigint => {
    const [integerPart, fractionalPart = ''] = amount.toString().split('.');

    // Ensure the fractional part has enough digits
    const paddedFraction = fractionalPart.padEnd(decimals, '0').slice(0, decimals);

    return BigInt(integerPart + paddedFraction);
};

export const calculateAmount = (rawAmount: bigint, decimals: number): number => {
    const rawStr = rawAmount.toString();

    if (rawStr.length <= decimals) {
        return Number(`0.${rawStr.padStart(decimals, '0')}`);
    }

    const integerPart = rawStr.slice(0, -decimals);
    const fractionalPart = rawStr.slice(-decimals).replace(/0+$/, '');

    return Number(fractionalPart ? `${integerPart}.${fractionalPart}` : integerPart);
};

export const toCamelCaseTransformer = (data: any) => {
    try {
        const parsedData = JSON.parse(data);
        return convertKeysToCamelCase(parsedData);
    } catch {
        return data;
    }
};
