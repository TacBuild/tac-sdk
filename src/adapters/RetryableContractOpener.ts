import { SandboxContract } from '@ton/sandbox';
import { Address, Contract, OpenedContract, TonClient, Transaction } from '@ton/ton';

import { allContractOpenerFailedError } from '../errors/instances';
import { ContractOpener, ILogger } from '../interfaces';
import { AddressInformation, GetTransactionsOptions } from '../structs/InternalStruct';
import { ContractState, Network, TrackTransactionTreeParams } from '../structs/Struct';
import { orbsOpener } from './OrbsOpener';
import { orbsOpener4 } from './OrbsOpener4';
import { tonClientOpener } from './TonClientOpener';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface OpenerConfig {
    /** Underlying opener implementation to use for this slot. */
    opener: ContractOpener;
    /** Number of retry attempts before falling back to the next opener. */
    retries: number;
    /** Delay in milliseconds between retries for this opener. */
    retryDelay: number;
}

export class RetryableContractOpener implements ContractOpener {
    private readonly openerConfigs: OpenerConfig[];
    private logger?: ILogger;

    constructor(openerConfigs: OpenerConfig[], logger?: ILogger) {
        if (openerConfigs.length === 0) {
            throw new Error('No ContractOpener instances available');
        }
        this.openerConfigs = openerConfigs;
        this.logger = logger;
    }

    async getTransactions(address: Address, opts: GetTransactionsOptions): Promise<Transaction[]> {
        const result = await this.executeWithFallback((config) => config.opener.getTransactions(address, opts));

        if (result.success && result.data) {
            return result.data;
        }
        throw result.lastError || allContractOpenerFailedError('Failed to get transactions');
    }

    async getTransactionByHash(
        address: Address,
        hash: string,
        opts?: GetTransactionsOptions,
    ): Promise<Transaction | null> {
        const result = await this.executeWithFallback((config) =>
            config.opener.getTransactionByHash(address, hash, opts),
        );

        if (result.success && result.data) {
            return result.data as Transaction | null;
        }
        throw result.lastError || allContractOpenerFailedError('Failed to get transaction by hash');
    }

    async getAdjacentTransactions(address: Address, hash: string, opts?: GetTransactionsOptions): Promise<Transaction[]> {
        const result = await this.executeWithFallback((config) => config.opener.getAdjacentTransactions(address, hash, opts));

        if (result.success && result.data) {
            return result.data;
        }
        throw result.lastError || allContractOpenerFailedError('Failed to get adjacent transactions');
    }

    open<T extends Contract>(src: T): OpenedContract<T> | SandboxContract<T> {
        const firstConfig = this.openerConfigs[0];
        const contract = firstConfig.opener.open(src);
        return this.createRetryableContract(contract, src);
    }

    async getContractState(address: Address): Promise<ContractState> {
        const result = await this.executeWithFallback((config) => config.opener.getContractState(address));

        if (result.success && result.data) {
            return result.data;
        }
        throw result.lastError || allContractOpenerFailedError('Failed to get contract state');
    }

    async getAddressInformation(address: Address): Promise<AddressInformation> {
        const result = await this.executeWithFallback((config) => config.opener.getAddressInformation(address));

        if (result.success && result.data) {
            return result.data;
        }
        throw result.lastError || allContractOpenerFailedError('Failed to get address information');
    }

    async getConfig(): Promise<string> {
        const result = await this.executeWithFallback((config) => config.opener.getConfig());

        if (result.success && result.data) {
            return result.data;
        }
        throw result.lastError || allContractOpenerFailedError('Failed to get blockchain config');
    }

    closeConnections(): void {
        for (const config of this.openerConfigs) {
            config.opener.closeConnections?.();
        }
    }

    async trackTransactionTree(
        address: string,
        hash: string,
        params?: TrackTransactionTreeParams,
    ): Promise<void> {
        const result = await this.executeWithFallback(async (config) => {
            return config.opener.trackTransactionTree(address, hash, params);
        });

        if (!result.success) {
            throw result.lastError || allContractOpenerFailedError('Failed to track transaction tree');
        }
    }

    private async executeWithFallback<T>(
        operation: (config: OpenerConfig) => Promise<T>,
    ): Promise<{ success: boolean; data?: T; lastError?: Error }> {
        let lastError: Error | undefined;

        for (const config of this.openerConfigs) {
            const result = await this.tryWithRetries(() => operation(config), config);

            if (result.success) {
                return { success: true, data: result.data };
            }
            lastError = result.lastError;
        }

        return { success: false, lastError };
    }

    private async tryWithRetries<T>(
        operation: () => Promise<T>,
        config: OpenerConfig,
    ): Promise<{ success: boolean; data?: T; lastError?: Error }> {
        let lastError: Error | undefined;

        for (let attempt = 0; attempt <= config.retries; attempt++) {
            try {
                const data = await operation();
                return { success: true, data };
            } catch (error) {
                lastError = error as Error;
                if (attempt < config.retries) {
                    await sleep(config.retryDelay);
                }
            }
        }

        return { success: false, lastError };
    }

    private createRetryableContract<T extends Contract>(
        contract: OpenedContract<T> | SandboxContract<T>,
        src: T,
    ): OpenedContract<T> | SandboxContract<T> {
        return new Proxy(contract, {
            get: (target, prop) => {
                const value = Reflect.get(target, prop);
                if (typeof value !== 'function') return value;

                return async (...args: unknown[]) => {
                    return this.callMethodAcrossOpeners(prop, args, src);
                };
            },
        });
    }

    private async callMethodAcrossOpeners<T extends Contract>(
        methodName: string | symbol,
        args: unknown[],
        src: T,
    ): Promise<unknown> {
        const result = await this.executeWithFallback((config) => {
            const contract = config.opener.open(src);
            const method = Reflect.get(contract, methodName);

            if (typeof method !== 'function') {
                throw new Error(`Method ${String(methodName)} is not a function`);
            }

            return method.call(contract, ...args);
        });

        if (result.success) return result.data;
        throw result.lastError || allContractOpenerFailedError('failed to call method in contract');
    }
}

export async function createDefaultRetryableOpener(
    tonRpcEndpoint: string,
    networkType: Network,
    maxRetries = 5,
    retryDelay = 1000,
    logger?: ILogger,
): Promise<ContractOpener> {
    const openers: OpenerConfig[] = [];

    const tonClient = new TonClient({ endpoint: new URL('api/v2/jsonRPC', tonRpcEndpoint).toString() });
    const opener = tonClientOpener(tonClient);

    openers.push({ opener, retries: maxRetries, retryDelay });

    if (networkType !== Network.DEV) {
        try {
            const opener4 = await orbsOpener4(networkType);
            openers.push({ opener: opener4, retries: maxRetries, retryDelay });
        } catch {
            // skip opener in case of failure
        }

        try {
            const opener = await orbsOpener(networkType);
            openers.push({ opener: opener, retries: maxRetries, retryDelay });
        } catch {
            // skip opener in case of failure
        }
    }

    return new RetryableContractOpener(openers, logger);
}
