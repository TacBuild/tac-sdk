import type { Asset } from '../../src';
import { AssetType } from '../../src';
import { AssetCache } from '../../src/assets/AssetCache';

// Minimal mock Asset implementation for cache tests
const mockAsset = (address: string): Asset => ({
  address,
  type: AssetType.FT,
  rawAmount: 0n,
  clone: {} as unknown as Asset, // not used by AssetCache
  withAmount: () => { throw new Error('not implemented'); },
  withRawAmount: () => { throw new Error('not implemented'); },
  addAmount: () => { throw new Error('not implemented'); },
  addRawAmount: () => { throw new Error('not implemented'); },
  getEVMAddress: async () => { throw new Error('not implemented'); },
  getTVMAddress: async () => { throw new Error('not implemented'); },
  generatePayload: async () => { throw new Error('not implemented'); },
  checkCanBeTransferredBy: async () => { throw new Error('not implemented'); },
  getBalanceOf: async () => { throw new Error('not implemented'); },
});

describe('AssetCache', () => {
  beforeEach(() => {
    AssetCache.clear();
  });

  it('stores and retrieves assets by address', () => {
    const token = { address: 'EQTestAddress' };
    const asset = mockAsset(token.address);

    expect(AssetCache.get(token)).toBeUndefined();
    AssetCache.set(token, asset);
    expect(AssetCache.get(token)).toBe(asset);
  });

  it('uses case-insensitive keys for address', () => {
    const upper = { address: 'AaBbCcDd' };
    const lower = { address: 'aabbccdd' };
    const asset = mockAsset(upper.address);

    AssetCache.set(upper, asset);
    expect(AssetCache.get(lower)).toBe(asset);
    expect(AssetCache.get(upper)).toBe(asset);
  });

  it('distinguishes entries by index when provided', () => {
    const base = 'EQAddressForCollection';
    const tokenNoIndex = { address: base };
    const tokenIndex0 = { address: base, index: 0n };
    const tokenIndex1 = { address: base, index: 1n };

    const asset0 = mockAsset('item0');
    const asset1 = mockAsset('item1');

    AssetCache.set(tokenIndex0, asset0);
    AssetCache.set(tokenIndex1, asset1);

    expect(AssetCache.get(tokenNoIndex)).toBeUndefined();
    expect(AssetCache.get(tokenIndex0)).toBe(asset0);
    expect(AssetCache.get(tokenIndex1)).toBe(asset1);
  });

  it('clear() empties the cache', () => {
    const token = { address: 'EQAnotherAddress' };
    const asset = mockAsset(token.address);
    AssetCache.set(token, asset);

    expect(AssetCache.get(token)).toBe(asset);
    AssetCache.clear();
    expect(AssetCache.get(token)).toBeUndefined();
  });
});
