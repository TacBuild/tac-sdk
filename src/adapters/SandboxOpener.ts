import type { Blockchain, GetMethodError, SandboxContract } from '@ton/sandbox';
import { Address, ComputeError, Contract, Transaction } from '@ton/ton';

import { ContractOpener } from '../interfaces';
import { AddressInformation, ContractState } from '../structs/Struct';
import { BaseContractOpener } from './BaseContractOpener';

export class SandboxOpener extends BaseContractOpener {
    constructor(private readonly blockchain: Blockchain) {
        super();
    }

    open<T extends Contract>(contract: T): SandboxContract<T> {
        return new Proxy(this.blockchain.openContract(contract), {
            get: (target, prop) => {
                const value = Reflect.get(target, prop);
                if (typeof prop !== 'string' || !prop.startsWith('get') || typeof value !== 'function') return value;

                return (...args: unknown[]) => {
                    const result = value.apply(target, args);
                    if (!(result instanceof Promise)) return result;

                    return result.catch((error: unknown) => {
                        if (error instanceof Error && 'exitCode' in error && typeof error.exitCode === 'number') {
                            const { vmLogs, debugLogs } = error as GetMethodError;
                            throw new ComputeError(error.message, error.exitCode, { logs: vmLogs, debugLogs });
                        }
                        throw error;
                    });
                };
            },
        });
    }

    async getContractState(address: Address): Promise<ContractState> {
        const state = await this.blockchain.provider(address).getState();
        return {
            balance: state.balance,
            code: 'code' in state.state ? (state.state.code ?? null) : null,
            state: state.state.type === 'uninit' ? 'uninitialized' : state.state.type,
        };
    }

    async getTransactions(): Promise<Transaction[]> {
        throw new Error('getTransactions not implemented for sandboxOpener');
    }

    async getAddressInformation(): Promise<AddressInformation> {
        throw new Error('getAddressInformation not implemented for sandboxOpener');
    }

    async getConfig(): Promise<string> {
        return this.blockchain.config.toBoc().toString('base64');
    }
}

export function sandboxOpener(blockchain: Blockchain): ContractOpener {
    return new SandboxOpener(blockchain);
}
