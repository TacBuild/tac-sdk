import { getHttpEndpoint, Network as TonNetwork } from '@orbs-network/ton-access';
import { Address, Contract, OpenedContract, TonClient, TonClient4, Transaction } from '@ton/ton';

import { ILogger } from '../interfaces';
import { AxiosHttpClient } from '../sdk/AxiosHttpClient';
import {
    DEFAULT_FIND_TX_LIMIT,
    DEFAULT_HTTP_CLIENT_TIMEOUT_MS,
    DEFAULT_RETRY_DELAY_MS,
    DEFAULT_RETRY_MAX_COUNT,
} from '../sdk/Consts';
import { normalizeHashToBase64 } from '../sdk/Utils';
import { AddressInformation, ContractState, GetTransactionsOptions, Network } from '../structs/Struct';
import { BaseContractOpener } from './BaseContractOpener';
import { getHttpEndpointWithRetry } from './OpenerUtils';
import { TonClient4Opener } from './TonClient4Opener';

export class TonClientOpener extends BaseContractOpener {
    private readonly httpClient: AxiosHttpClient;

    constructor(
        private readonly client: TonClient,
        logger?: ILogger,
    ) {
        super(logger);
        this.httpClient = new AxiosHttpClient({ timeout: DEFAULT_HTTP_CLIENT_TIMEOUT_MS });
    }

    static create(endpoint: string, timeout = DEFAULT_HTTP_CLIENT_TIMEOUT_MS, logger?: ILogger): TonClientOpener {
        const client = new TonClient({ endpoint, timeout });
        return new TonClientOpener(client, logger);
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
            // TonClient API expects base64 transaction hash and converts it to hex internally.
            hash: opts.hash ? normalizeHashToBase64(opts.hash) : undefined,
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
        const url = new URL('getConfigAll', this.client.parameters.endpoint);
        url.searchParams.append('seqno', info.latestSeqno.toString());

        // Use longer timeout for getConfig as the response is very large (~100KB+)
        // and Brotli decompression can take significant time
        const response = await this.httpClient.get<{
            ok: boolean;
            result?: { config?: { bytes?: string } };
        }>(url.toString(), { timeout: 60000 });
        const body = response.data;

        if (!body?.ok || !body.result?.config?.bytes) {
            throw new Error(`Failed to fetch config: ${JSON.stringify(body)}`);
        }

        return body.result.config.bytes;
    }
}

export function tonClientOpener(client: TonClient, logger?: ILogger): TonClientOpener {
    return new TonClientOpener(client, logger);
}

export async function orbsOpener(network: Network, logger?: ILogger): Promise<TonClientOpener> {
    const tonNetwork: TonNetwork = network === Network.MAINNET ? 'mainnet' : 'testnet';
    const endpoint = await getHttpEndpoint({ network: tonNetwork });
    const client = new TonClient({ endpoint, timeout: DEFAULT_HTTP_CLIENT_TIMEOUT_MS });
    return new TonClientOpener(client, logger);
}

export async function getOrbsOpenerWithRetry(
    network: Network,
    timeout = DEFAULT_HTTP_CLIENT_TIMEOUT_MS,
    logger?: ILogger,
    maxRetries = DEFAULT_RETRY_MAX_COUNT,
    delay = DEFAULT_RETRY_DELAY_MS,
): Promise<TonClient4Opener> {
    const endpoint = await getHttpEndpointWithRetry(network, maxRetries, delay);
    const client = new TonClient4({ endpoint, timeout });
    return new TonClient4Opener(client, logger);
}
