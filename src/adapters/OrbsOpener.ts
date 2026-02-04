import { Address, Contract, OpenedContract, TonClient, Transaction } from '@ton/ton';

import { ContractOpener } from '../interfaces';
import { DEFAULT_FIND_TX_LIMIT } from '../sdk/Consts';
import { AddressInformation, ContractState, GetTransactionsOptions,Network } from '../structs/Struct';
import { BaseContractOpener } from './BaseContractOpener';
import { getHttpEndpointWithRetry } from './OpenerUtils';

export class OrbsOpener extends BaseContractOpener {

    private constructor(
        private readonly client: TonClient,
    ) {
        super();
    }

    static async create(network: Network): Promise<OrbsOpener> {
        const endpoint = await getHttpEndpointWithRetry(network);
        const client = new TonClient({ endpoint });
        return new OrbsOpener(client);
    }

    open<T extends Contract>(contract: T): OpenedContract<T> {
        return this.client.open(contract);
    }

    async getContractState(address: Address): Promise<ContractState> {
        return this.client.getContractState(address);
    }

    async getTransactions(address: Address, opts: GetTransactionsOptions): Promise<Transaction[]> {
        // TonClient doesn't accept timeoutMs and retryDelayMs, filter them out
        const clientOpts = {
            limit: opts.limit ?? DEFAULT_FIND_TX_LIMIT,
            lt: opts.lt,
            hash: opts.hash,
            to_lt: opts.to_lt,
            inclusive: opts.inclusive,
            archival: opts.archival,
        };
        return this.client.getTransactions(address, clientOpts);
    }

    async getAddressInformation(addr: Address): Promise<AddressInformation> {
        const state = await this.client.getContractState(addr);
        return {
            lastTransaction: {
                lt: state.lastTransaction?.lt ?? '',
                hash: state.lastTransaction?.hash ?? '',
            },
        };
    }

    async getConfig(): Promise<string> {
        throw new Error(
            'getConfig() is not supported by TonClient (orbs v2 API). Use OrbsOpener4 or LiteClientOpener instead, which support blockchain config retrieval.',
        );
    }
}

export async function orbsOpener(network: Network): Promise<ContractOpener> {
    return OrbsOpener.create(network);
}
