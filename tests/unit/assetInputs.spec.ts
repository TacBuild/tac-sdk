import { AssetFactory } from '../../src';
import { AssetType, Network, NFTAddressType } from '../../src';
import { TacSdk } from '../../src';
import { normalizeAsset, normalizeAssets } from '../../src/sdk/Utils';

const FT_ADDRESS = 'EQB3j4RtzlF8pIgZuhMIvP6rFclGHJI1-XeQ8f7I2YhdxzzB';
const NFT_ITEM_ADDRESS = 'kQDv0zDAk0-BBaGFRerc9KakXfCsxVYNoA8p9cKs3SbNW7rp';
const NFT_COLLECTION_ADDRESS = 'kQDZhIdhjy94j7ZU2JiSXaqMEWE9wBblywEJ18sIqnOFg8Ja';
const NFT_COLLECTION_INDEX = 0n;

describe('Asset inputs on TESTNET (FT, NFT item, NFT collection+index)', () => {
    let sdk: TacSdk;

    beforeAll(async () => {
        sdk = await TacSdk.create({ network: Network.TESTNET });
    }, 20000);

    afterAll(async () => {
        if (sdk) {
            await sdk.closeConnections();
        }
    });

    it('creates FT asset from provided testnet address via AssetFactory', async () => {
        const ft = await AssetFactory.from(sdk.config, { address: FT_ADDRESS, tokenType: AssetType.FT });
        expect(ft.type).toBe(AssetType.FT);
        expect(typeof ft.address).toBe('string');
        expect(ft.address.length).toBeGreaterThan(0);

        const ft2 = await AssetFactory.from(sdk.config, { address: FT_ADDRESS, tokenType: AssetType.FT });
        expect(ft2).not.toBe(ft);
        expect(ft2.type).toBe(AssetType.FT);
        expect(ft2.rawAmount).toBe(0n);
        expect(ft2.address).toBe(ft.address);
    }, 50000);

    it('creates NFT asset from ITEM address via AssetFactory', async () => {
        const nftItem = await AssetFactory.from(sdk.config, {
            address: NFT_ITEM_ADDRESS,
            tokenType: AssetType.NFT,
            addressType: NFTAddressType.ITEM,
        });
        expect(nftItem.type).toBe(AssetType.NFT);
        expect(typeof nftItem.address).toBe('string');
        expect(nftItem.address.length).toBeGreaterThan(0);
    }, 50000);

    it('creates NFT asset from COLLECTION+INDEX via AssetFactory', async () => {
        const nftFromCollection = await AssetFactory.from(sdk.config, {
            address: NFT_COLLECTION_ADDRESS,
            tokenType: AssetType.NFT,
            addressType: NFTAddressType.COLLECTION,
            index: NFT_COLLECTION_INDEX,
        });
        expect(nftFromCollection.type).toBe(AssetType.NFT);
        expect(typeof nftFromCollection.address).toBe('string');
        expect(nftFromCollection.address.length).toBeGreaterThan(0);
    }, 50000);

    it('normalizeAsset supports all input shapes (FT amount/rawAmount, NFT item, NFT collection+itemIndex)', async () => {
        // FT with human amount
        const a1 = await normalizeAsset(sdk.config, { address: FT_ADDRESS, amount: 1 });
        expect(a1.type).toBe(AssetType.FT);
        expect(a1.rawAmount).toBeGreaterThan(0n);

        // FT with rawAmount
        const a2 = await normalizeAsset(sdk.config, { address: FT_ADDRESS, rawAmount: 1000n });
        expect(a2.type).toBe(AssetType.FT);
        expect(a2.rawAmount).toBe(1000n);

        // NFT item by address
        const a3 = await normalizeAsset(sdk.config, { address: NFT_ITEM_ADDRESS });
        expect(a3.type).toBe(AssetType.NFT);

        // NFT collection by address + itemIndex
        const a4 = await normalizeAsset(sdk.config, {
            address: NFT_COLLECTION_ADDRESS,
            itemIndex: NFT_COLLECTION_INDEX,
        });
        expect(a4.type).toBe(AssetType.NFT);
    }, 50000);

    it('normalizeAsset throws when FT amount is not provided or zero', async () => {
        await expect(normalizeAsset(sdk.config, { address: FT_ADDRESS })).rejects.toThrow(/FT asset with zero rawAmount\/amount is not allowed:/);
        await expect(normalizeAsset(sdk.config, { address: FT_ADDRESS, amount: 0 })).rejects.toThrow(/FT asset with zero rawAmount\/amount is not allowed:/);
        await expect(normalizeAsset(sdk.config, { address: FT_ADDRESS, rawAmount: 0n })).rejects.toThrow(/FT asset with zero rawAmount\/amount is not allowed:/);
    }, 50000);

    it('normalizeAsset returns input when it is already an Asset instance', async () => {
        const ft = await AssetFactory.from(sdk.config, { address: FT_ADDRESS, tokenType: AssetType.FT });
        const normalized = await normalizeAsset(sdk.config, ft);

        expect(normalized).toBe(ft);
        expect(normalized.type).toBe(AssetType.FT);
    }, 50000);

    it('normalizeAssets supports mixed input shapes and preserves Asset instances', async () => {
        const existingFt = await AssetFactory.from(sdk.config, { address: FT_ADDRESS, tokenType: AssetType.FT });

        const inputs = [
            existingFt, // already Asset
            { address: FT_ADDRESS, amount: 1 }, // FT human amount
            { address: FT_ADDRESS, rawAmount: 1000n }, // FT raw amount
            { address: NFT_ITEM_ADDRESS }, // NFT item
            { address: NFT_COLLECTION_ADDRESS, itemIndex: NFT_COLLECTION_INDEX }, // NFT from collection+index
        ];

        const res = await normalizeAssets(sdk.config, inputs);

        expect(Array.isArray(res)).toBe(true);
        expect(res.length).toBe(inputs.length);

        expect(res[0]).toBe(existingFt);
        expect(res[0].type).toBe(AssetType.FT);

        expect(res[1].type).toBe(AssetType.FT);
        expect(res[1].rawAmount).toBeGreaterThan(0n);

        expect(res[2].type).toBe(AssetType.FT);
        expect(res[2].rawAmount).toBe(1000n);

        expect(res[3].type).toBe(AssetType.NFT);

        expect(res[4].type).toBe(AssetType.NFT);
    }, 50000);

    it('normalizeAssets handles empty and undefined inputs', async () => {
        await expect(normalizeAssets(sdk.config, [])).resolves.toEqual([]);
        await expect(normalizeAssets(sdk.config, undefined)).resolves.toEqual([]);
    }, 50000);

    describe('normalizeAssets throws when', () => {
        beforeAll(async () => {
            sdk = await TacSdk.create({ network: Network.MAINNET });
        }, 10000);

        it('should handle evm address of TON for MAINNET', async () => {
            await normalizeAsset(sdk.config, { address: "0xb76d91340F5CE3577f0a056D29f6e3Eb4E88B140", amount: 1 });
        });
    })
});
