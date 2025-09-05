import { getHttpEndpoint, getHttpV4Endpoint } from '@orbs-network/ton-access';
import { Blockchain } from '@ton/sandbox';
import { TonClient, TonClient4 } from '@ton/ton';
import { mainnet, testnet } from '@tonappchain/artifacts';
import { LiteClient, LiteEngine, LiteRoundRobinEngine, LiteSingleEngine } from '@tonappchain/ton-lite-client';

import { Network } from '../structs/Struct';
import { ContractOpener } from '../interfaces';

type LiteServer = { ip: number; port: number; id: { '@type': string; key: string } };

function intToIP(int: number) {
    const part1 = int & 255;
    const part2 = (int >> 8) & 255;
    const part3 = (int >> 16) & 255;
    const part4 = (int >> 24) & 255;

    return part4 + '.' + part3 + '.' + part2 + '.' + part1;
}

async function getDefaultLiteServers(network: Network): Promise<LiteServer[]> {
    const url = network === Network.TESTNET ? testnet.DEFAULT_LITESERVERS : mainnet.DEFAULT_LITESERVERS;
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
    };
}

export async function orbsOpener(network: Network): Promise<ContractOpener> {
    const endpoint = await getHttpEndpoint({
        network,
    });
    return new TonClient({ endpoint });
}

export async function orbsOpener4(network: Network, timeout = 10000): Promise<ContractOpener> {
    const endpoint = await getHttpV4Endpoint({ network });
    const client4 = new TonClient4({ endpoint, timeout });
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
    };
}
