import type { Asset, IConfiguration } from '../interfaces';

type AssetKey = string;
type AssetCacheToken = { address: string; index?: bigint; tokenType?: string };

export class AssetCache {
    private static cache = new WeakMap<IConfiguration, Map<AssetKey, Asset>>();

    /**
     * Get asset from cache
     */
    static get(configuration: IConfiguration, token: AssetCacheToken): Asset | undefined {
        const key = this.generateKey(token);
        return this.cache.get(configuration)?.get(key);
    }

    /**
     * Set asset in cache
     */
    static set(configuration: IConfiguration, token: AssetCacheToken, asset: Asset): void {
        const key = this.generateKey(token);
        let scopedCache = this.cache.get(configuration);
        if (!scopedCache) {
            scopedCache = new Map<AssetKey, Asset>();
            this.cache.set(configuration, scopedCache);
        }
        scopedCache.set(key, asset);
    }

    /**
     * Clear the cache
     */
    static clear(): void {
        this.cache = new WeakMap<IConfiguration, Map<AssetKey, Asset>>();
    }

    private static generateKey(token: AssetCacheToken): AssetKey {
        // Normalize address to lowercase for consistency
        const normalizedAddress = token.address.toLowerCase();
        const parts = [normalizedAddress];

        if (token.tokenType !== undefined) {
            parts.push(token.tokenType);
        }

        if (token.index !== undefined) {
            parts.push(token.index.toString());
        }

        return parts.join('|');
    }
}
