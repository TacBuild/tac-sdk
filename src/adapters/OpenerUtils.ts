import { getHttpEndpoint, getHttpV4Endpoint, Network as TonNetwork } from '@orbs-network/ton-access';

import { sleep } from '../sdk/Utils';
import { Network } from '../structs/Struct';

export async function getHttpEndpointWithRetry(network: Network, maxRetries = 5, delay = 1000): Promise<string> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const tonNetwork: TonNetwork = network === Network.MAINNET ? 'mainnet' : 'testnet';
            return await getHttpEndpoint({ network: tonNetwork });
        } catch (error) {
            lastError = error as Error;
            if (attempt < maxRetries - 1) {
                await sleep(delay);
            }
        }
    }

    throw lastError || new Error('Failed to get HTTP endpoint after retries');
}

export async function getHttpV4EndpointWithRetry(network: Network, maxRetries = 5, delay = 1000): Promise<string> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const tonNetwork: TonNetwork = network === Network.MAINNET ? 'mainnet' : 'testnet';
            return await getHttpV4Endpoint({ network: tonNetwork });
        } catch (error) {
            lastError = error as Error;
            if (attempt < maxRetries - 1) {
                await sleep(delay);
            }
        }
    }

    throw lastError || new Error('Failed to get HTTP V4 endpoint after retries');
}
