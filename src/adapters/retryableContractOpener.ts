import { ContractOpener, Network } from '../structs/Struct';
import { Address, Contract, OpenedContract } from '@ton/ton';
import { orbsOpener, orbsOpener4 } from './contractOpener';
import { TonClient } from '@ton/ton';
import { SandboxContract } from '@ton/sandbox';
import { mainnet, testnet } from '@tonappchain/artifacts';

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface OpenerConfig {
    opener: ContractOpener;
    retries: number;
    retryDelay: number;
}

export class RetryableContractOpener implements ContractOpener {
    private readonly openerConfigs: OpenerConfig[] = [];

    constructor(openerConfigs: OpenerConfig[]) {
        if (openerConfigs.length > 0) {
            this.openerConfigs = openerConfigs.map((config) => ({
                opener: config.opener,
                retries: config.retries ?? 3,
                retryDelay: config.retryDelay ?? 1000,
            }));
        }
    }

    private async executeWithRetries<T>(operation: (opener: ContractOpener) => Promise<T>): Promise<T> {
        let lastError: Error | null = null;

        for (const openerConfig of this.openerConfigs) {
            const { opener, retries, retryDelay } = openerConfig;

            for (let attempt = 0; attempt < retries; attempt++) {
                try {
                    return await operation(opener);
                } catch (error) {
                    lastError = error as Error;

                    if (attempt < retries - 1) {
                        await sleep(retryDelay);
                    }
                }
            }
        }

        throw new Error(`All ContractOpener types failed: ${lastError?.message || 'Unknown error'}`);
    }

    open<T extends Contract>(src: T): OpenedContract<T> | SandboxContract<T> {
        if (this.openerConfigs.length === 0) {
            throw new Error('No ContractOpener instances available');
        }

        for (const { opener } of this.openerConfigs) {
            try {
                return opener.open(src);
            } catch (error) {
                // Continue to next opener
            }
        }

        throw new Error('All ContractOpener types failed to open contract');
    }

    async getContractState(address: Address): Promise<{
        balance: bigint;
        state: 'active' | 'uninitialized' | 'frozen';
        code: Buffer | null;
    }> {
        return this.executeWithRetries((opener) => opener.getContractState(address));
    }

    closeConnections(): void {
        for (const { opener } of this.openerConfigs) {
            opener.closeConnections?.();
        }
    }
}

export async function createDefaultRetryableOpener(
    network: Network,
    maxRetries = 3,
    retryDelay = 1000,
): Promise<ContractOpener> {
    const tonClient = new TonClient({
        endpoint:
            network === Network.TESTNET
                ? new URL('api/v2/jsonRPC', testnet.TON_RPC_ENDPOINT_BY_TAC).toString()
                : mainnet.TON_PUBLIC_RPC_ENDPOINT,
    });

    const opener4 = await orbsOpener4(network);
    const opener = await orbsOpener(network);

    return new RetryableContractOpener([
        { opener: tonClient, retries: maxRetries, retryDelay },
        { opener: opener4, retries: maxRetries, retryDelay },
        { opener: opener, retries: maxRetries, retryDelay },
    ]);
}
