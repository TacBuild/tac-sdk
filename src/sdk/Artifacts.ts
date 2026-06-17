import type { NetworkArtifacts } from '../../artifacts';
import { dev, mainnet, testnet } from '../../artifacts';
import { Network } from '../structs/Struct';

export function getArtifacts(network: Network): NetworkArtifacts {
    switch (network) {
        case Network.MAINNET:
            return mainnet;
        case Network.TESTNET:
            return testnet;
        case Network.DEV:
            return dev;
        default:
            throw new Error(`Unsupported network: ${network}`);
    }
}
