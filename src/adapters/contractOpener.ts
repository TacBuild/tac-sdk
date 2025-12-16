import { getHttpEndpoint, getHttpV4Endpoint } from '@orbs-network/ton-access';
import { Network as TonNetwork } from '@orbs-network/ton-access';
import { Blockchain } from '@ton/sandbox';
import {
    Address,
    beginCell,
    Cell,
    ExternalAddress,
    loadTransaction,
    storeMessage,
    TonClient,
    TonClient4,
    Transaction,
} from '@ton/ton';
import { LiteClient, LiteEngine, LiteRoundRobinEngine, LiteSingleEngine } from '@tonappchain/ton-lite-client';

import { mainnet, testnet } from '../../artifacts';
import { ContractOpener } from '../interfaces';
import { sleep } from '../sdk/Utils';
import { GetTransactionsOptions } from '../structs/InternalStruct';
import { Network } from '../structs/Struct';

async function getHttpEndpointWithRetry(network: Network, maxRetries = 5, delay = 1000): Promise<string> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const tonNetwork: TonNetwork = network === Network.MAINNET ? 'mainnet' : 'testnet';
            return await getHttpEndpoint({ network: tonNetwork });
        } catch (error) {
            lastError = error as Error;
            if (attempt <= maxRetries) {
                await sleep(delay);
            }
        }
    }

    throw lastError || new Error('Failed to get HTTP endpoint after retries');
}

async function getHttpV4EndpointWithRetry(network: Network, maxRetries = 5, delay = 1000): Promise<string> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const tonNetwork: TonNetwork = network === Network.MAINNET ? 'mainnet' : 'testnet';
            return await getHttpV4Endpoint({ network: tonNetwork });
        } catch (error) {
            lastError = error as Error;
            if (attempt <= maxRetries) {
                await sleep(delay);
            }
        }
    }

    throw lastError || new Error('Failed to get HTTP V4 endpoint after retries');
}

// -------------------------------------------------------------------
// 1. Paginate all transactions of an address (old → new order)
// -------------------------------------------------------------------
async function* paginateTransactions(
    addr: Address,
    getTransactions: ContractOpener['getTransactions'],
    limit = 100,
): AsyncIterable<Transaction[]> {
    let currentLt: bigint | undefined;
    let currentHash: string | undefined;

    while (true) {
        const batch = await getTransactions(addr, {
            limit,
            lt: currentLt?.toString(),
            hash: currentHash,
            archival: true,
        });

        yield batch;

        if (batch.length < limit) {
            return; // no more pages
        }

        if (batch.length === 0) {
            return;
        }

        const last = batch[batch.length - 1];
        currentLt = last.lt;
        currentHash = last.hash().toString('base64');
    }
}

// -------------------------------------------------------------------
// 2. Find the first transaction whose hash (base64) matches the target
// -------------------------------------------------------------------
async function findTransactionByHash(
    addr: Address,
    targetHashB64: string,
    getTransactions: ContractOpener['getTransactions'],
): Promise<Transaction | null> {
    for await (const batch of paginateTransactions(addr, getTransactions)) {
        for (const tx of batch) {
            if (tx.hash().toString('base64') === targetHashB64) {
                return tx;
            }
        }
    }
    return null;
}

// -------------------------------------------------------------------
// 3.Retrieve the transaction with `hashB64` and all transactions
//    that are directly adjacent to it (outgoing messages + optional incoming)
// -------------------------------------------------------------------
export async function getAdjacentTransactionsHelper(
    addr: Address,
    hashB64: string,
    getTransactions: ContractOpener['getTransactions'],
): Promise<Transaction[]> {
    // 1. Find the root transaction
    const rootTx = await findTransactionByHash(addr, hashB64, getTransactions);
    if (!rootTx) return [];

    const adjacent: Transaction[] = [];

    // 2. Follow every outgoing message
    for (const msg of rootTx.outMessages.values()) {
        const dst = msg.info.dest;
        if (!dst || dst instanceof ExternalAddress) continue;

        const msgHashB64 = beginCell().store(storeMessage(msg)).endCell().hash().toString('base64');
        const tx = await findTransactionByHash(dst, msgHashB64, getTransactions);
        if (tx) adjacent.push(tx);
    }

    // 3. Optional: follow the incoming message (if it exists and is internal)
    if (rootTx.inMessage?.info.type === 'internal') {
        const src = rootTx.inMessage.info.src;
        if (src instanceof Address) {
            // The incoming message belongs to the sender's out-message list,
            // so we look for the same message hash on the sender side.
            const msgHashB64 = beginCell().store(storeMessage(rootTx.inMessage)).endCell().hash().toString('base64');
            const tx = await findTransactionByHash(src, msgHashB64, getTransactions);
            if (tx) adjacent.push(tx);
        }
    }

    return adjacent;
}

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

export async function liteClientOpener(
    options: { liteservers: LiteServer[] } | { network: Network },
): Promise<ContractOpener> {
    const liteservers = 'liteservers' in options ? options.liteservers : await getDefaultLiteServers(options.network);
    const engines: LiteEngine[] = [];
    for (const server of liteservers) {
        const engine = await LiteSingleEngine.create({
            host: `tcp://${intToIP(server.ip)}:${server.port}`,
            publicKey: Buffer.from(server.id.key, 'base64'),
        });
        engines.push(engine);
    }

    const engine: LiteEngine | null = new LiteRoundRobinEngine(engines);
    const client = new LiteClient({ engine });

    const closeConnections = () => {
        engine.close();
    };

    const getTransactions = async (address: Address, opts: GetTransactionsOptions): Promise<Transaction[]> => {
        const txsBuffered = await client
            .getAccountTransactions(
                address,
                opts.lt ?? '',
                opts.hash ? Buffer.from(opts.hash, 'base64') : Buffer.alloc(0),
                opts.limit,
            )
            .then((r) => r.transactions);
        const cell = Cell.fromBoc(txsBuffered);
        const transactions = cell.map((c) => loadTransaction(c.beginParse()));
        return transactions;
    };

    return {
        getContractState: async (addr) => {
            const block = await client.getMasterchainInfo();
            const state = await client.getAccountState(addr, block.last);
            const accountState = state.state?.storage?.state;
            const code = accountState?.type === 'active' ? accountState?.state?.code?.toBoc() : null;
            return {
                balance: state.balance.coins,
                state: state.state!.storage.state.type === 'uninit' ? 'uninitialized' : state.state!.storage.state.type,
                code: code ?? null,
            };
        },
        open: (contract) => client.open(contract),
        closeConnections,
        getTransactions,
        getAdjacentTransactions: async (addr, hash) => getAdjacentTransactionsHelper(addr, hash, getTransactions),
    };
}

export function sandboxOpener(blockchain: Blockchain): ContractOpener {
    return {
        open: (contract) => blockchain.openContract(contract),
        getContractState: async (address) => {
            const state = await blockchain.provider(address).getState();
            return {
                balance: state.balance,
                code: 'code' in state.state ? (state.state.code ?? null) : null,
                state: state.state.type === 'uninit' ? 'uninitialized' : state.state.type,
            };
        },
        getTransactions: () => {
            throw 'Not implemented.';
        },
        getAdjacentTransactions() {
            throw 'Not implemented.';
        },
    };
}

export async function orbsOpener(network: Network): Promise<ContractOpener> {
    const endpoint = await getHttpEndpointWithRetry(network);
    const client = new TonClient({ endpoint });
    return {
        open: client.open,
        getContractState: client.getContractState,
        getTransactions: client.getTransactions,
        getAdjacentTransactions: async (addr, hash) =>
            getAdjacentTransactionsHelper(addr, hash, client.getTransactions),
    };
}

export async function orbsOpener4(network: Network, timeout = 10000): Promise<ContractOpener> {
    const endpoint = await getHttpV4EndpointWithRetry(network);
    const client4 = new TonClient4({ endpoint, timeout });
    const getTransactions = async (address: Address, opts: GetTransactionsOptions): Promise<Transaction[]> => {
        return client4
            .getAccountTransactions(
                address,
                opts.lt ? BigInt(opts.lt) : 0n,
                opts.hash ? Buffer.from(opts.hash, 'base64') : Buffer.alloc(0),
            )
            .then((res) => res.map((t) => t.tx));
    };
    return {
        open: (contract) => client4.open(contract),
        getContractState: async (address) => {
            const latestBlock = await client4.getLastBlock();
            const latestBlockNumber = latestBlock.last.seqno;
            const state = await client4.getAccount(latestBlockNumber, address);
            return {
                balance: BigInt(state.account.balance.coins),
                code:
                    'code' in state.account.state && state.account.state.code !== null
                        ? Buffer.from(state.account.state.code, 'base64')
                        : null,
                state: state.account.state.type === 'uninit' ? 'uninitialized' : state.account.state.type,
            };
        },
        getTransactions,
        getAdjacentTransactions: async (addr, hash) => getAdjacentTransactionsHelper(addr, hash, getTransactions),
    };
}

export function tonClientOpener(endpoint: string): ContractOpener {
    const client = new TonClient({
        endpoint,
    });
    return {
        open: client.open.bind(client),
        getContractState: client.getContractState.bind(client),
        getTransactions: client.getTransactions.bind(client),
        getAdjacentTransactions: async (addr, hash) =>
            getAdjacentTransactionsHelper(addr, hash, client.getTransactions.bind(client)),
    };
}
