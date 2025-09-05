import { Blockchain, SandboxContract } from '@ton/sandbox';
import { Address, Cell, Contract } from '@ton/ton';

import { IContractOpener, ContractState } from '../../../src';

export class UnstableContractOpener implements IContractOpener {
    public callCounts = new Map<string, number>();

    constructor(
        private name: string,
        private blockchain: Blockchain,
        private failsBeforeSuccess: number = 0,
    ) {}

    open<T extends Contract>(contract: T): SandboxContract<T> {
        return new Proxy(this.blockchain.openContract(contract), {
            get: (target, prop, receiver) => {
                const originalMethod = Reflect.get(target, prop, receiver);

                if (typeof originalMethod === 'function' && typeof prop === 'string') {
                    return async (...args: unknown[]) => {
                        const key = `${this.name}-${prop}`;
                        const currentCount = (this.callCounts.get(key) || 0) + 1;
                        this.callCounts.set(key, currentCount);

                        if (currentCount <= this.failsBeforeSuccess) {
                            throw new Error(
                                `${this.name}: Simulated network failure for ${prop} (attempt ${currentCount})`,
                            );
                        }

                        this.callCounts.set(key, 0);
                        return originalMethod.apply(target, args);
                    };
                }

                return originalMethod;
            },
        }) as SandboxContract<T>;
    }

    async getContractState(address: Address): Promise<ContractState> {
        const key = `${this.name}-getContractState`;
        const currentCount = (this.callCounts.get(key) || 0) + 1;
        this.callCounts.set(key, currentCount);

        if (currentCount <= this.failsBeforeSuccess) {
            throw new Error(`${this.name}: Network timeout for getContractState (attempt ${currentCount})`);
        }

        this.callCounts.set(key, 0);

        const account = await this.blockchain.getContract(address);
        const accountState = account.account.account;

        let code: Cell | undefined | null;
        if (accountState?.storage.state.type === 'active') {
            code = accountState.storage.state.state.code;
        }

        const type = accountState?.storage.state.type;

        return {
            balance: account.balance,
            state: type === 'uninit' ? 'uninitialized' : type || 'uninitialized',
            code: code?.toBoc() || null,
        };
    }

    closeConnections(): void {}
}
