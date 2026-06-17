import * as dev from "./dev";
import * as mainnet from "./mainnet";
import * as testnet from "./testnet";

export { dev, mainnet, testnet };
export type NetworkArtifacts = typeof mainnet | typeof testnet | typeof dev;
