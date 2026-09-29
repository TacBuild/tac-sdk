import { Network } from '../structs/Struct';

/** AA contract addresses for a network. */
export interface AaAddresses {
    entryPoint: string;
    accountFactory: string;
    paymaster: string;
    permit2: string;
}

/** Built-in AA configuration for a network. */
export interface AaNetworkConfig extends AaAddresses {
    chainId: number;
    /**
     * Bundler RPC URL. Intentionally left undefined in the built-in defaults — there is no
     * public bundler endpoint to ship, so pass `bundlerUrl` to {@link TacAccountSdk.create}.
     */
    bundlerUrl?: string;
}

/**
 * Built-in per-network AA defaults. TESTNET is SPB (chainId 2391) — the same chain
 * tac-sdk's TESTNET resolves to. MAINNET is not deployed yet.
 */
export const AA_NETWORKS: Partial<Record<Network, AaNetworkConfig>> = {
    [Network.TESTNET]: {
        chainId: 2391,
        entryPoint: '0x239DBD98defbad1c369034a2897bD5b8b57b468A',
        accountFactory: '0x7879c3237811A86092E89AD94837163Ae71d6669',
        // paymaster for token USD₮ (0xbA7E…9220, 6-dec); the fee token is read on-chain
        paymaster: '0xD41B5AC8803bd9371c0bdB44CB95B8b1879F8865',
        permit2: '0x36d6565DcdE4674115bBd1d86E511bebB1C425b9',
        // bundlerUrl: undefined — provide it via TacAccountSdk.create({ bundlerUrl })
    },
    // MAINNET: account abstraction not deployed yet
};
