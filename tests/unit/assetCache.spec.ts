import type { Asset, AssetFromFTArg, IConfiguration } from '../../src';
import { AssetFactory, AssetFeeMode, AssetType, Network, Origin } from '../../src';
import { AssetCache } from '../../src/assets/AssetCache';

// Minimal mock Asset implementation for cache tests
const mockAsset = (address: string): Asset => ({
    address,
    type: AssetType.FT,
    rawAmount: 0n,
    clone: {} as unknown as Asset, // not used by AssetCache
    feeMode: AssetFeeMode.LEGACY,
    withAmount: () => {
        throw new Error('not implemented');
    },
    withRawAmount: () => {
        throw new Error('not implemented');
    },
    addAmount: () => {
        throw new Error('not implemented');
    },
    addRawAmount: () => {
        throw new Error('not implemented');
    },
    getEVMAddress: async () => {
        throw new Error('not implemented');
    },
    getTVMAddress: async () => {
        throw new Error('not implemented');
    },
    generatePayload: () => {
        throw new Error('not implemented');
    },
    checkCanBeTransferredBy: async () => {
        throw new Error('not implemented');
    },
    getBalanceOf: async () => {
        throw new Error('not implemented');
    },
    origin: Origin.TON,
});

function mockCachedAsset(address: string): Asset {
    const asset = mockAsset(address);
    const clone: Asset = {
        ...mockAsset(`${address}:clone`),
        withRawAmount: () => clone,
    };
    asset.clone = clone;
    return asset;
}

describe('AssetCache', () => {
    const config = {} as IConfiguration;

    beforeEach(() => {
        AssetCache.clear();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('stores and retrieves assets by address', () => {
        const token = { address: 'EQTestAddress' };
        const asset = mockAsset(token.address);

        expect(AssetCache.get(config, token)).toBeUndefined();
        AssetCache.set(config, token, asset);
        expect(AssetCache.get(config, token)).toBe(asset);
    });

    it('uses case-insensitive keys for address', () => {
        const upper = { address: 'AaBbCcDd' };
        const lower = { address: 'aabbccdd' };
        const asset = mockAsset(upper.address);

        AssetCache.set(config, upper, asset);
        expect(AssetCache.get(config, lower)).toBe(asset);
        expect(AssetCache.get(config, upper)).toBe(asset);
    });

    it('distinguishes entries by index when provided', () => {
        const base = 'EQAddressForCollection';
        const tokenNoIndex = { address: base };
        const tokenIndex0 = { address: base, index: 0n };
        const tokenIndex1 = { address: base, index: 1n };

        const asset0 = mockAsset('item0');
        const asset1 = mockAsset('item1');

        AssetCache.set(config, tokenIndex0, asset0);
        AssetCache.set(config, tokenIndex1, asset1);

        expect(AssetCache.get(config, tokenNoIndex)).toBeUndefined();
        expect(AssetCache.get(config, tokenIndex0)).toBe(asset0);
        expect(AssetCache.get(config, tokenIndex1)).toBe(asset1);
    });

    it('keeps entries scoped to each configuration', () => {
        const firstConfig = {} as IConfiguration;
        const secondConfig = {} as IConfiguration;
        const token = { address: 'EQSameAddress', tokenType: AssetType.FT };
        const firstAsset = mockAsset('first');
        const secondAsset = mockAsset('second');

        AssetCache.set(firstConfig, token, firstAsset);
        AssetCache.set(secondConfig, token, secondAsset);

        expect(AssetCache.get(firstConfig, token)).toBe(firstAsset);
        expect(AssetCache.get(secondConfig, token)).toBe(secondAsset);
    });

    it('clear() empties the cache', () => {
        const token = { address: 'EQAnotherAddress' };
        const asset = mockAsset(token.address);
        AssetCache.set(config, token, asset);

        expect(AssetCache.get(config, token)).toBe(asset);
        AssetCache.clear();
        expect(AssetCache.get(config, token)).toBeUndefined();
    });

    it('does not reuse AssetFactory cache entries across configurations', async () => {
        const token: AssetFromFTArg = { address: 'EQSharedAddress', tokenType: AssetType.FT };
        const mainnetConfig = {
            network: Network.MAINNET,
            nativeTONAddress: 'EQMainnetNative',
        } as IConfiguration;
        const testnetConfig = {
            network: Network.TESTNET,
            nativeTONAddress: 'EQTestnetNative',
        } as IConfiguration;
        const mainnetAsset = mockCachedAsset('mainnet') as Awaited<ReturnType<typeof AssetFactory.createFTAsset>>;
        const testnetAsset = mockCachedAsset('testnet') as Awaited<ReturnType<typeof AssetFactory.createFTAsset>>;

        const createFTAsset = jest
            .spyOn(AssetFactory, 'createFTAsset')
            .mockImplementation(async (configuration) =>
                configuration === mainnetConfig ? mainnetAsset : testnetAsset,
            );

        await expect(AssetFactory.from(mainnetConfig, token)).resolves.toBe(mainnetAsset);
        await expect(AssetFactory.from(testnetConfig, token)).resolves.toBe(testnetAsset);
        expect(createFTAsset).toHaveBeenCalledTimes(2);
    });
});
