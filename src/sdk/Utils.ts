import { Address, beginCell, Cell, storeStateInit } from '@ton/ton';
import { AbiCoder, ethers } from 'ethers';
import { sha256_sync } from 'ton-crypto';

import { FT, NFT, TON } from '../assets';
import { invalidMethodNameError } from '../errors';
import { Asset } from '../interfaces';
import { RandomNumberByTimestamp } from '../structs/InternalStruct';
import { AssetType, EvmProxyMsg, FeeParams, TransactionLinker, ValidExecutors, WaitOptions } from '../structs/Struct';
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

export function buildEvmDataCell(
    transactionLinker: TransactionLinker,
    evmProxyMsg: EvmProxyMsg,
    validExecutors: ValidExecutors,
): Cell {
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
        evmValidExecutors: validExecutors.tac,
        tvmValidExecutors: validExecutors.ton,
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

export function calculateEVMTokenAddress(
    abiCoder: AbiCoder,
    tokenUtilsAddress: string,
    crossChainLayerTokenBytecode: string,
    crossChainLayerAddress: string,
    tvmAddress: string,
): string {
    const salt = ethers.keccak256(ethers.solidityPacked(['string'], [tvmAddress]));
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
            (acc as Record<string, unknown>)[camelKey] = convertKeysToCamelCase((data as Record<string, unknown>)[key]);
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

export const toCamelCaseTransformer = (data: string) => {
    try {
        const parsedData = JSON.parse(data);
        return convertKeysToCamelCase(parsedData);
    } catch {
        return data;
    }
};

export const generateFeeData = (feeParams?: FeeParams): Cell | undefined => {
    if (feeParams) {
        const feeDataBuilder = beginCell()
            .storeBit(feeParams.isRoundTrip)
            .storeCoins(feeParams.protocolFee)
            .storeCoins(feeParams.evmExecutorFee);
        if (feeParams.isRoundTrip) {
            feeDataBuilder.storeCoins(feeParams.tvmExecutorFee);
        }
        return feeDataBuilder.endCell();
    } else {
        return undefined;
    }
};

export async function waitUntilSuccess<T, A extends unknown[]>(
    options: WaitOptions<T> = {},
    operation: (...args: A) => Promise<T>,
    ...args: A
): Promise<T> {
    const timeout = options.timeout ?? 300000;
    const maxAttempts = options.maxAttempts ?? 30;
    const delay = options.delay ?? 10000;
    const successCheck = options.successCheck;

    options.logger?.debug(
        `Starting wait for success with timeout=${timeout}ms, maxAttempts=${maxAttempts}, delay=${delay}ms`,
    );
    const startTime = Date.now();
    let attempt = 1;

    while (true) {
        const currentTime = Date.now();
        const elapsedTime = currentTime - startTime;
        try {
            const result = await operation(...args);
            if (!result) {
                throw new Error(`Empty result`);
            }
            options.logger?.debug(`Result: ${formatObjectForLogging(result)}`);
            if (successCheck && !successCheck(result)) {
                throw new Error(`Result is not successful`);
            }
            options.logger?.debug(`Attempt ${attempt} successful`);

            return result;
        } catch (error) {
            if (elapsedTime >= timeout) {
                options.logger?.debug(`Timeout after ${elapsedTime}ms`);
                throw error;
            }

            if (attempt >= maxAttempts) {
                options.logger?.debug(`Max attempts (${maxAttempts}) reached`);
                throw error;
            }
            options.logger?.debug(`Error on attempt ${attempt}: ${error}`);
            options.logger?.debug(`Waiting ${delay}ms before next attempt`);
            await sleep(delay);
            attempt++;
        }
    }
}

export function formatObjectForLogging(obj: unknown): string {
    return JSON.stringify(obj, (key, value) => (typeof value === 'bigint' ? value.toString() : value));
}

export async function aggregateTokens(assets?: Asset[]): Promise<{
    jettons: FT[];
    nfts: NFT[];
    ton?: TON;
}> {
    const uniqueAssetsMap: Map<string, Asset> = new Map();
    let ton: TON | undefined;

    for await (const asset of assets ?? []) {
        if (asset.type !== AssetType.FT) continue;

        if (!asset.address) {
            ton = ton ? await ton.addAmount({ rawAmount: asset.rawAmount }) : (asset.clone as TON);
            continue;
        }

        let jetton = uniqueAssetsMap.get(asset.address);
        if (!jetton) {
            jetton = asset.clone;
        } else {
            jetton = await jetton.addAmount({ rawAmount: asset.rawAmount });
        }

        uniqueAssetsMap.set(asset.address, jetton);
    }
    const jettons: FT[] = Array.from(uniqueAssetsMap.values()) as FT[];

    uniqueAssetsMap.clear();
    for await (const asset of assets ?? []) {
        if (asset.type !== AssetType.NFT) continue;
        uniqueAssetsMap.set(asset.address, asset.clone);
    }
    const nfts: NFT[] = Array.from(uniqueAssetsMap.values()) as NFT[];

    return {
        jettons,
        nfts,
        ton,
    };
}

export function sha256toBigInt(ContractName: string): bigint {
    const hash = sha256_sync(ContractName);

    return BigInt('0x' + hash.toString('hex'));
}


