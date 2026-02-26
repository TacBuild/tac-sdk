import { Blockchain, SandboxContract } from '@ton/sandbox';
import { Address, Contract, Transaction } from '@ton/ton';

import { ContractOpener } from '../interfaces';
import { AddressInformation, ContractState } from '../structs/Struct';
import { BaseContractOpener } from './BaseContractOpener';

export class SandboxOpener extends BaseContractOpener {
    constructor(private readonly blockchain: Blockchain) {
        super();
    }

    open<T extends Contract>(contract: T): SandboxContract<T> {
        return this.blockchain.openContract(contract);
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
