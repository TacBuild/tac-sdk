import { dev, mainnet, testnet } from '../../artifacts';

import { InternalTACParams, InternalTONParams } from '../structs/InternalStruct';
import { Network } from '../structs/Struct';

export interface IConfiguration {
    /** Current network the SDK is configured for (e.g., MAINNET/TESTNET). */
    readonly network: Network;
    /** Resolved artifacts bundle for the selected network (contract ABIs/addresses). */
    readonly artifacts: typeof testnet | typeof mainnet | typeof dev;
    /** Low-level TON client parameters and dependencies. */
    readonly TONParams: InternalTONParams;
    /** Low-level TAC (EVM-side) client parameters and dependencies. */
    readonly TACParams: InternalTACParams;
    /** List of Lite Sequencer API endpoints used for tracking and utilities. */
    readonly liteSequencerEndpoints: string[];
    /** Native TON coin master address for the configured network. */
    readonly nativeTONAddress: string;
    /**
     * Returns the native TAC token (Jetton master) address for the configured network.
     */
    nativeTACAddress(): Promise<string>;
    /** Whitelisted EVM (TAC) executor addresses considered trusted. */
    readonly getTrustedTACExecutors: string[];
    /** Whitelisted TVM (TON) executor addresses considered trusted. */
    readonly getTrustedTONExecutors: string[];
    /**
     * Closes any underlying connections/resources held by configuration-level clients.
     * Implementations should be idempotent.
     */
    closeConnections(): unknown;
    /**
     * Checks if a given TVM address is a deployed contract on the current network.
     * @param address TVM address to verify.
     */
    isContractDeployedOnTVM(address: string): Promise<boolean>;
}
