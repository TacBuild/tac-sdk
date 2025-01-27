import { LiteClient, LiteEngine, LiteRoundRobinEngine, LiteSingleEngine } from '@tonappchain/ton-lite-client';
import { ContractOpener, Network } from '../structs/Struct';
import { Blockchain } from '@ton/sandbox';
import { MAINNET_DEFAULT_LITESERVERS, TESTNET_DEFAULT_LITESERVERS } from '../sdk/Consts';
import { getHttpEndpoint } from '@orbs-network/ton-access';
import { TonClient } from '@ton/ton';

type LiteServer = { ip: number; port: number; id: { '@type': string; key: string } };

function intToIP(int: number) {
    var part1 = int & 255;
    var part2 = (int >> 8) & 255;
    var part3 = (int >> 16) & 255;
    var part4 = (int >> 24) & 255;

    return part4 + '.' + part3 + '.' + part2 + '.' + part1;
}

async function getDefaultLiteServers(network: Network): Promise<LiteServer[]> {
    const url = network === Network.Testnet ? TESTNET_DEFAULT_LITESERVERS : MAINNET_DEFAULT_LITESERVERS;
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
        engines.push(
            new LiteSingleEngine({
                host: `tcp://${intToIP(server.ip)}:${server.port}`,
                publicKey: Buffer.from(server.id.key, 'base64'),
            }),
        );
    }

    const engine: LiteEngine | null = new LiteRoundRobinEngine(engines);
    const client = new LiteClient({ engine });

    const closeConnections = () => {
        engines.forEach((e) => {
            e.close();
        });
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
    const client = new TonClient({ endpoint });
    return client;
}
