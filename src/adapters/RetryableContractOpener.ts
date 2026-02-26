import { SandboxContract } from '@ton/sandbox';
import { Address, Contract, OpenedContract, TonClient, Transaction } from '@ton/ton';

import { TransactionError } from '../errors';
import { allContractOpenerFailedError } from '../errors/instances';
import { ContractOpener, ILogger } from '../interfaces';
import { DEFAULT_HTTP_CLIENT_TIMEOUT_MS, DEFAULT_RETRY_DELAY_MS, DEFAULT_RETRY_MAX_COUNT } from '../sdk/Consts';
import {
    AddressInformation,
    ContractState,
    GetTransactionsOptions,
    Network,
    TrackTransactionTreeParams,
    TrackTransactionTreeResult,
} from '../structs/Struct';
import { orbsOpener4 } from './TonClient4Opener';
import { orbsOpener, tonClientOpener } from './TonClientOpener';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface OpenerConfig {
    /** Underlying opener implementation to use for this slot. */
    opener: ContractOpener;
    /** Number of retry attempts before falling back to the next opener. */
    retries: number;
    /** Delay in milliseconds between retries for this opener. */
    retryDelay: number;
}

interface ExecuteWithFallbackOptions {
    useRetries?: boolean;
    shouldFallbackOnError?: (error: Error) => boolean;
    operationName?: string;
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
        if (logger) {
            this.applyLoggerToOpeners(logger);
        }
    }

    setLogger(logger: ILogger): void {
        if (!this.logger) {
            this.logger = logger;
        }
        this.applyLoggerToOpeners(logger);
    }

    private applyLoggerToOpeners(logger: ILogger): void {
        for (const config of this.openerConfigs) {
            config.opener.setLogger(logger);
        }
    }

    async getTransactions(address: Address, opts: GetTransactionsOptions): Promise<Transaction[]> {
        const result = await this.executeWithFallback((config) => config.opener.getTransactions(address, opts), {
            operationName: 'getTransactions',
        });

        if (result.success && result.data !== undefined) {
            return result.data;
        }
        throw result.lastError || allContractOpenerFailedError('Failed to get transactions');
    }

    async getTransactionByHash(
        address: Address,
        hash: string,
        opts?: GetTransactionsOptions,
    ): Promise<Transaction | null> {
        const result = await this.executeWithFallback(
            (config) => config.opener.getTransactionByHash(address, hash, opts),
            { operationName: 'getTransactionByHash' },
        );

        if (result.success) {
            return result.data ?? null;
        }
        throw result.lastError || allContractOpenerFailedError('Failed to get transaction by hash');
    }

    async getAdjacentTransactions(
        address: Address,
        hash: string,
        opts?: GetTransactionsOptions,
    ): Promise<Transaction[]> {
        const result = await this.executeWithFallback(
            (config) => config.opener.getAdjacentTransactions(address, hash, opts),
            { operationName: 'getAdjacentTransactions' },
        );

        if (result.success && result.data !== undefined) {
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
        const result = await this.executeWithFallback((config) => config.opener.getContractState(address), {
            operationName: 'getContractState',
        });

        if (result.success && result.data !== undefined) {
            return result.data;
        }
        throw result.lastError || allContractOpenerFailedError('Failed to get contract state');
    }

    async getAddressInformation(address: Address): Promise<AddressInformation> {
        const result = await this.executeWithFallback((config) => config.opener.getAddressInformation(address), {
            operationName: 'getAddressInformation',
        });

        if (result.success && result.data !== undefined) {
            return result.data;
        }
        throw result.lastError || allContractOpenerFailedError('Failed to get address information');
    }

    async getConfig(): Promise<string> {
        const result = await this.executeWithFallback((config) => config.opener.getConfig(), {
            operationName: 'getConfig',
        });

        if (result.success && result.data !== undefined) {
            return result.data;
        }
        throw result.lastError || allContractOpenerFailedError('Failed to get blockchain config');
    }

    async getTransactionByTxHash(
        address: Address,
        txHash: string,
        opts?: GetTransactionsOptions,
    ): Promise<Transaction | null> {
        const result = await this.executeWithFallback(
            (config) => config.opener.getTransactionByTxHash(address, txHash, opts),
            { operationName: 'getTransactionByTxHash' },
        );

        if (result.success) {
            return result.data ?? null;
        }
        throw result.lastError || allContractOpenerFailedError('Failed to get transaction by transaction hash');
    }

    async getTransactionByInMsgHash(
        address: Address,
        msgHash: string,
        opts?: GetTransactionsOptions,
    ): Promise<Transaction | null> {
        const result = await this.executeWithFallback(
            (config) => config.opener.getTransactionByInMsgHash(address, msgHash, opts),
            { operationName: 'getTransactionByInMsgHash' },
        );

        if (result.success) {
            return result.data ?? null;
        }
        throw result.lastError || allContractOpenerFailedError('Failed to get transaction by message hash');
    }

    async getTransactionByOutMsgHash(
        address: Address,
        msgHash: string,
        opts?: GetTransactionsOptions,
    ): Promise<Transaction | null> {
        const result = await this.executeWithFallback(
            (config) => config.opener.getTransactionByOutMsgHash(address, msgHash, opts),
            { operationName: 'getTransactionByOutMsgHash' },
        );

        if (result.success) {
            return result.data ?? null;
        }
        throw result.lastError || allContractOpenerFailedError('Failed to get transaction by outgoing message hash');
    }

    closeConnections(): void {
        for (const config of this.openerConfigs) {
            config.opener.closeConnections?.();
        }
    }

    async trackTransactionTree(address: string, hash: string, params?: TrackTransactionTreeParams): Promise<void> {
        const result = await this.executeWithFallback(
            async (config) => config.opener.trackTransactionTree(address, hash, params),
            {
                shouldFallbackOnError: (error) => this.isTransportError(error),
                operationName: 'trackTransactionTree',
            },
        );

        if (!result.success) {
            if (result.lastError instanceof TransactionError) {
                throw result.lastError;
            }
            throw result.lastError || allContractOpenerFailedError('Failed to track transaction tree');
        }
    }

    async trackTransactionTreeWithResult(
        address: string,
        hash: string,
        params?: TrackTransactionTreeParams,
    ): Promise<TrackTransactionTreeResult> {
        const result = await this.executeWithFallback(
            async (config) => config.opener.trackTransactionTreeWithResult(address, hash, params),
            {
                shouldFallbackOnError: (error) => this.isTransportError(error),
                operationName: 'trackTransactionTreeWithResult',
            },
        );

        if (!result.success) {
            if (result.lastError instanceof TransactionError) {
                throw result.lastError;
            }
            throw result.lastError || allContractOpenerFailedError('Failed to track transaction tree with result');
        }

        return result.data!;
    }

    private async executeWithFallback<T>(
        operation: (config: OpenerConfig) => Promise<T>,
        options: ExecuteWithFallbackOptions = {},
    ): Promise<{ success: boolean; data?: T; lastError?: Error }> {
        const { useRetries = true, shouldFallbackOnError, operationName = 'operation' } = options;
        let lastError: Error | undefined;

        for (let index = 0; index < this.openerConfigs.length; index++) {
            const config = this.openerConfigs[index];
            const openerLabel = `opener ${index + 1}/${this.openerConfigs.length}`;
            this.logger?.debug(
                `[RetryableContractOpener] ${operationName}: trying ${openerLabel}`,
            );

            const result = useRetries
                ? await this.tryWithRetries(() => operation(config), config, `${operationName} ${openerLabel}`)
                : await this.trySingleAttempt(() => operation(config));

            if (result.success) {
                return { success: true, data: result.data };
            }
            lastError = result.lastError;
            const isTransactionError = lastError instanceof TransactionError;
            const isContractExecutionError = !!lastError && this.isContractExecutionError(lastError);
            const shouldStopOnNonTransportError =
                !!lastError && !!shouldFallbackOnError && !shouldFallbackOnError(lastError);
            if (lastError) {
                const stopReason = isTransactionError
                    ? 'TransactionError'
                    : isContractExecutionError
                      ? 'contract execution error'
                      : shouldStopOnNonTransportError
                        ? 'non-transport error'
                        : undefined;
                this.logger?.debug(
                    `[RetryableContractOpener] ${operationName}: ${openerLabel} failed${
                        stopReason ? ` (stopping fallback because of ${stopReason})` : ''
                    }: ${lastError.message}`,
                );
            }
            if (isTransactionError) {
                return { success: false, lastError };
            }
            if (isContractExecutionError) {
                return { success: false, lastError };
            }
            if (shouldStopOnNonTransportError) {
                return { success: false, lastError };
            }
        }

        return { success: false, lastError };
    }

    private async trySingleAttempt<T>(operation: () => Promise<T>): Promise<{ success: boolean; data?: T; lastError?: Error }> {
        try {
            const data = await operation();
            return { success: true, data };
        } catch (error) {
            return { success: false, lastError: error as Error };
        }
    }

    private async tryWithRetries<T>(
        operation: () => Promise<T>,
        config: OpenerConfig,
        operationContext = 'operation',
    ): Promise<{ success: boolean; data?: T; lastError?: Error }> {
        let lastError: Error | undefined;

        for (let attempt = 0; attempt <= config.retries; attempt++) {
            try {
                const data = await operation();
                return { success: true, data };
            } catch (error) {
                lastError = error as Error;
                if (lastError instanceof TransactionError || this.isContractExecutionError(lastError)) {
                    return { success: false, lastError };
                }
                if (attempt < config.retries) {
                    this.logger?.debug(
                        `[RetryableContractOpener] ${operationContext}: attempt ${attempt + 1}/${config.retries + 1} failed (${lastError.message}), retrying in ${config.retryDelay}ms`,
                    );
                    await sleep(config.retryDelay);
                }
            }
        }

        return { success: false, lastError };
    }

    private isContractExecutionError(error: Error): boolean {
        const errorWithExit = error as Error & { exitCode?: number; vmExitCode?: number; exit_code?: number };
        if (
            typeof errorWithExit.exitCode === 'number' ||
            typeof errorWithExit.vmExitCode === 'number' ||
            typeof errorWithExit.exit_code === 'number'
        ) {
            return true;
        }

        const message = String(error.message ?? error);
        return (
            /unable to execute get method/i.test(message) ||
            /exit[_\s-]*code\s*:\s*\d+/i.test(message) ||
            /vm exit code\s*:\s*\d+/i.test(message)
        );
    }

    private isTransportError(error: Error): boolean {
        if (error instanceof TransactionError) {
            return false;
        }

        const errorWithResponse = error as Error & {
            response?: {
                status?: number;
                statusCode?: number;
            };
            code?: string;
        };
        const status = errorWithResponse.response?.status ?? errorWithResponse.response?.statusCode;
        if (typeof status === 'number') {
            return status === 429 || status >= 500;
        }

        const code = errorWithResponse.code ?? '';
        if (['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN'].includes(code)) {
            return true;
        }

        const message = String(error.message ?? error);
        return /too many requests|timeout|timed out|network|connection/i.test(message);
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
        const addressLabel = src.address ? src.address.toString() : 'unknown';
        const result = await this.executeWithFallback((config) => {
            const contract = config.opener.open(src);
            const method = Reflect.get(contract, methodName);

            if (typeof method !== 'function') {
                throw new Error(`Method ${String(methodName)} is not a function`);
            }

            return method.call(contract, ...args);
        }, { operationName: `${String(methodName)} (address=${addressLabel})` });

        if (result.success) return result.data;
        throw result.lastError || allContractOpenerFailedError('failed to call method in contract');
    }
}

export async function createDefaultRetryableOpener(
    tonRpcEndpoint: string,
    networkType: Network,
    maxRetries = DEFAULT_RETRY_MAX_COUNT,
    retryDelay = DEFAULT_RETRY_DELAY_MS,
    logger?: ILogger,
): Promise<RetryableContractOpener> {
    const openers: OpenerConfig[] = [];

    const tonClient = new TonClient({
        endpoint: new URL('api/v2/jsonRPC', tonRpcEndpoint).toString(),
        timeout: DEFAULT_HTTP_CLIENT_TIMEOUT_MS,
    });
    const opener = tonClientOpener(tonClient, logger);

    openers.push({ opener, retries: maxRetries, retryDelay });

    if (networkType !== Network.DEV) {
        try {
            const opener = await orbsOpener(networkType, logger);
            openers.push({ opener: opener, retries: maxRetries, retryDelay });
        } catch {
            // skip opener in case of failure
        }

        try {
            const opener4 = await orbsOpener4(networkType, DEFAULT_HTTP_CLIENT_TIMEOUT_MS, logger);
            openers.push({ opener: opener4, retries: maxRetries, retryDelay });
        } catch {
            // skip opener in case of failure
        }
    }

    return new RetryableContractOpener(openers, logger);
}
