import { Address, Contract, OpenedContract, TonClient, Transaction } from '@ton/ton';

import { ContractOpener } from '../interfaces';
import { AxiosHttpClient } from '../sdk/AxiosHttpClient';
import { DEFAULT_FIND_TX_LIMIT, DEFAULT_HTTP_CLIENT_TIMEOUT_MS } from '../sdk/Consts';
import { AddressInformation, GetTransactionsOptions } from '../structs/InternalStruct';
import { ContractState, Network } from '../structs/Struct';
import { BaseContractOpener } from './BaseContractOpener';
import { getHttpEndpointWithRetry } from './OpenerUtils';

export class OrbsOpener extends BaseContractOpener {
    private readonly httpClient: AxiosHttpClient;

    private constructor(
        private readonly client: TonClient,
        private readonly endpoint: string,
    ) {
        super();
        this.httpClient = new AxiosHttpClient({ timeout: DEFAULT_HTTP_CLIENT_TIMEOUT_MS });
    }

    static async create(network: Network): Promise<OrbsOpener> {
        const endpoint = await getHttpEndpointWithRetry(network);
        const client = new TonClient({ endpoint });
        return new OrbsOpener(client, endpoint);
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
        const info = await this.client.getMasterchainInfo();
        const url = new URL('getConfigAll', this.endpoint);
        url.searchParams.append('seqno', info.latestSeqno.toString());

        const response = await this.httpClient.get<{
            ok: boolean;
            result?: { config?: { bytes?: string } };
        }>(url.toString());
        const body = response.data;

        if (!body.ok || !body.result?.config?.bytes) {
            throw new Error(`Failed to fetch config: ${JSON.stringify(body)}`);
        }

        return body.result.config.bytes;
    }
}

export async function orbsOpener(network: Network): Promise<ContractOpener> {
    return OrbsOpener.create(network);
}
