import { Asset } from '../structs/Struct';

type AssetKey = string;

export class AssetCache {
    private static readonly cache = new Map<AssetKey, Asset>();

    /**
     * Get asset from cache
     */
    static get(token: { address: string; index?: bigint }): Asset | undefined {
        const key = this.generateKey(token);
        return this.cache.get(key);
    }

    /**
     * Set asset in cache
     */
    static set(token: { address: string; index?: bigint }, asset: Asset): void {
        const key = this.generateKey(token);
        this.cache.set(key, asset);
    }

    /**
     * Clear the cache
     */
    static clear(): void {
        this.cache.clear();
    }

    private static generateKey(token: { address: string; index?: bigint }): AssetKey {
        // Normalize address to lowercase for consistency
        const normalizedAddress = token.address.toLowerCase();
        const parts = [normalizedAddress];

        if (token.index !== undefined) {
            parts.push(token.index.toString());
        }

        return parts.join('|');
    }
}
