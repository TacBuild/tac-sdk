import { Address, Contract, OpenedContract, TonClient4, Transaction } from '@ton/ton';

import { ILogger } from '../interfaces';
import { DEFAULT_HTTP_CLIENT_TIMEOUT_MS } from '../sdk/Consts';
import { AddressInformation, ContractState, GetTransactionsOptions, Network } from '../structs/Struct';
import { BaseContractOpener } from './BaseContractOpener';
import { getHttpV4EndpointWithRetry } from './OpenerUtils';

export class TonClient4Opener extends BaseContractOpener {
    constructor(private readonly client4: TonClient4, logger?: ILogger) {
        super(logger);
    }

    static create(endpoint: string, timeout = 10000, logger?: ILogger): TonClient4Opener {
        const client4 = new TonClient4({ endpoint, timeout });
        return new TonClient4Opener(client4, logger);
    }

    open<T extends Contract>(contract: T): OpenedContract<T> {
        return this.client4.open(contract);
    }

    async getContractState(address: Address): Promise<ContractState> {
        const latestBlock = await this.client4.getLastBlock();
        const latestBlockNumber = latestBlock.last.seqno;
        const state = await this.client4.getAccount(latestBlockNumber, address);
        return {
            balance: BigInt(state.account.balance.coins),
            code:
                'code' in state.account.state && state.account.state.code !== null
                    ? Buffer.from(state.account.state.code, 'base64')
                    : null,
            state: state.account.state.type === 'uninit' ? 'uninitialized' : state.account.state.type,
        };
    }

    async getTransactions(address: Address, opts: GetTransactionsOptions): Promise<Transaction[]> {
        const allTxs = await this.client4
            .getAccountTransactions(
                address,
                opts.lt ? BigInt(opts.lt) : 0n,
                opts.hash ? Buffer.from(opts.hash, 'base64') : Buffer.alloc(0),
            )
            .then((res) => res.map((t) => t.tx));

        // Apply limit if specified
        let txs = opts.limit ? allTxs.slice(0, opts.limit) : allTxs;

        // Apply to_lt filter if specified
        if (opts.to_lt) {
            const toLt = BigInt(opts.to_lt);
            txs = txs.filter((tx) => {
                const comparison = tx.lt > toLt;
                return opts.inclusive ? tx.lt >= toLt : comparison;
            });
        }

        return txs;
    }

    async getAddressInformation(addr: Address): Promise<AddressInformation> {
        const latestBlock = await this.client4.getLastBlock();
        const latestBlockNumber = latestBlock.last.seqno;
        const state = await this.client4.getAccount(latestBlockNumber, addr);
        return {
            lastTransaction: {
                lt: state.account.last?.lt ?? '',
                hash: state.account.last?.hash ?? '',
            },
        };
    }

    async getConfig(): Promise<string> {
        const block = await this.client4.getLastBlock();
        const { config } = await this.client4.getConfig(block.last.seqno);
        return config.cell;
    }
}

/**
 * Creates a TonClient4Opener instance using TonHub public API
 * @param network Network to connect to (mainnet or testnet)
 * @param timeout Request timeout in milliseconds
 * @param logger
 */
export function tonHubApi4Opener(
    network: Network,
    timeout = DEFAULT_HTTP_CLIENT_TIMEOUT_MS,
    logger?: ILogger,
): TonClient4Opener {
    const endpoint =
        network === Network.MAINNET ? 'https://mainnet-v4.tonhubapi.com' : 'https://testnet-v4.tonhubapi.com';
    return TonClient4Opener.create(endpoint, timeout, logger);
}

export function tonClient4Opener(client: TonClient4, logger?: ILogger): TonClient4Opener {
    return new TonClient4Opener(client, logger);
}

export async function orbsOpener4(
    network: Network,
    timeout = DEFAULT_HTTP_CLIENT_TIMEOUT_MS,
    logger?: ILogger,
): Promise<TonClient4Opener> {
    const endpoint = await getHttpV4EndpointWithRetry(network);
    const client = new TonClient4({ endpoint, timeout });
    return new TonClient4Opener(client, logger);
}
