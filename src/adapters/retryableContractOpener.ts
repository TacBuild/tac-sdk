import { SandboxContract } from '@ton/sandbox';
import { Address, Contract, OpenedContract, TonClient } from '@ton/ton';
import { dev, mainnet, testnet } from '../../artifacts';

import { allContractOpenerFailedError } from '../errors/instances';
import { ContractOpener } from '../interfaces';
import { ContractState, Network } from '../structs/Struct';
import { orbsOpener, orbsOpener4 } from './contractOpener';

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

    constructor(openerConfigs: OpenerConfig[]) {
        if (openerConfigs.length === 0) {
            throw new Error('No ContractOpener instances available');
        }
        this.openerConfigs = openerConfigs;
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

    closeConnections(): void {
        for (const config of this.openerConfigs) {
            config.opener.closeConnections?.();
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
    artifacts: typeof testnet | typeof mainnet | typeof dev,
    maxRetries = 5,
    retryDelay = 1000,
): Promise<ContractOpener> {
    const tonClient = new TonClient({
        endpoint: new URL('api/v2/jsonRPC', artifacts.TON_RPC_ENDPOINT_BY_TAC).toString(),
    });

    const network: Network = artifacts === testnet ? Network.TESTNET : Network.MAINNET;

    const opener4 = await orbsOpener4(network);
    const opener = await orbsOpener(network);

    return new RetryableContractOpener([
        { opener: tonClient, retries: maxRetries, retryDelay },
        { opener: opener4, retries: maxRetries, retryDelay },
        { opener: opener, retries: maxRetries, retryDelay },
    ]);
}
