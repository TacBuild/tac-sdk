import { Address, beginCell, Cell, Contract, loadTransaction, OpenedContract, Transaction } from '@ton/ton';
import { LiteClient, LiteEngine, LiteRoundRobinEngine, LiteSingleEngine } from '@tonappchain/ton-lite-client';

import { mainnet, testnet } from '../../artifacts';
import { ContractOpener } from '../interfaces';
import { DEFAULT_FIND_TX_LIMIT } from '../sdk/Consts';
import { AddressInformation, ContractState, GetTransactionsOptions, Network } from '../structs/Struct';
import { BaseContractOpener } from './BaseContractOpener';

type LiteServer = { ip: number; port: number; id: { '@type': string; key: string } };

function intToIP(int: number) {
    const part1 = int & 255;
    const part2 = (int >> 8) & 255;
    const part3 = (int >> 16) & 255;
    const part4 = (int >> 24) & 255;

    return part4 + '.' + part3 + '.' + part2 + '.' + part1;
}

async function getDefaultLiteServers(network: Network): Promise<LiteServer[]> {
    const url =
        network === Network.TESTNET || network === Network.DEV
            ? testnet.DEFAULT_LITESERVERS
            : mainnet.DEFAULT_LITESERVERS;
    const resp = await fetch(url);
    const liteClients = await resp.json();
    return liteClients.liteservers;
}

export class LiteClientOpener extends BaseContractOpener {
    private constructor(
        private readonly client: LiteClient,
        private readonly engine: LiteEngine,
    ) {
        super();
    }

    static async create(options: { liteservers: LiteServer[] } | { network: Network }): Promise<LiteClientOpener> {
        const liteservers =
            'liteservers' in options ? options.liteservers : await getDefaultLiteServers(options.network);
        const engines: LiteEngine[] = [];
        for (const server of liteservers) {
            const engine = await LiteSingleEngine.create({
                host: `tcp://${intToIP(server.ip)}:${server.port}`,
                publicKey: Buffer.from(server.id.key, 'base64'),
            });
            engines.push(engine);
        }

        const engine: LiteEngine = new LiteRoundRobinEngine(engines);
        const client = new LiteClient({ engine });

        return new LiteClientOpener(client, engine);
    }

    open<T extends Contract>(contract: T): OpenedContract<T> {
        return this.client.open(contract);
    }

    closeConnections(): void {
        this.engine.close();
    }

    async getContractState(addr: Address): Promise<ContractState> {
        const block = await this.client.getMasterchainInfo();
        const state = await this.client.getAccountState(addr, block.last);
        const accountState = state.state?.storage?.state;
        const code = accountState?.type === 'active' ? accountState?.state?.code?.toBoc() : null;
        return {
            balance: state.balance.coins,
            state: state.state!.storage.state.type === 'uninit' ? 'uninitialized' : state.state!.storage.state.type,
            code: code ?? null,
        };
    }

    async getTransactions(address: Address, opts: GetTransactionsOptions): Promise<Transaction[]> {
        // LiteClient requires valid lt and hash to fetch transactions
        // If not provided, fetch from the latest transaction
        let lt: string;
        let hash: Buffer;

        if (opts.lt && opts.hash) {
            lt = opts.lt;
            hash = Buffer.from(opts.hash, 'base64');
        } else {
            // Get latest transaction info first
            const block = await this.client.getMasterchainInfo();
            const state = await this.client.getAccountState(address, block.last);

            if (!state.lastTx) {
                // No transactions for this account
                return [];
            }

            lt = state.lastTx.lt.toString();
            hash = Buffer.from(state.lastTx.hash.toString(16).padStart(64, '0'), 'hex');
        }

        const txsBuffered = await this.client
            .getAccountTransactions(address, lt, hash, opts.limit ?? DEFAULT_FIND_TX_LIMIT)
            .then((r) => r.transactions);

        const cell = Cell.fromBoc(txsBuffered);
        let txs = cell.map((c) => loadTransaction(c.beginParse()));

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
        const block = await this.client.getMasterchainInfo();
        const state = await this.client.getAccountState(addr, block.last);
        return {
            lastTransaction: {
                lt: state.lastTx?.lt.toString() ?? '',
                hash: Buffer.from(state.lastTx?.hash.toString(16) ?? '', 'hex').toString('base64'),
            },
        };
    }

    async getConfig(): Promise<string> {
        const block = await this.client.getMasterchainInfo();
        const { config } = await this.client.getConfig(block.last);
        return beginCell().storeDictDirect(config).endCell().toBoc().toString('base64');
    }
}

export async function liteClientOpener(
    options: { liteservers: LiteServer[] } | { network: Network },
): Promise<ContractOpener> {
    return LiteClientOpener.create(options);
}
