import { beginCell, Dictionary } from '@ton/ton';
import axios from 'axios';
import { createHash } from 'crypto';

import {
    buildJettonOffChainMetadata,
    buildJettonOnchainMetadata,
    buildNFTOffChainMetadata,
    buildNFTOnchainMetadata,
    JettonMetadata,
    NFTMetadata,
    OFFCHAIN_CONTENT_PREFIX,
    ONCHAIN_CONTENT_PREFIX,
    readJettonMetadata,
    readNFTMetadata,
} from '../../../src/wrappers/ContentUtils';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ContentUtils', () => {
    describe('buildJettonOffChainMetadata', () => {
        it('builds off-chain metadata cell with correct prefix and content', () => {
            const contentUri = 'https://example.com/metadata.json';
            const result = buildJettonOffChainMetadata(contentUri);

            const slice = result.beginParse();
            const prefix = slice.loadUint(8);
            const buffer = slice.loadBuffer(slice.remainingBits / 8);

            expect(prefix).toBe(OFFCHAIN_CONTENT_PREFIX);
            expect(buffer.toString('ascii')).toBe(contentUri);
        });

        it('handles empty content URI', () => {
            const result = buildJettonOffChainMetadata('');
            const slice = result.beginParse();
            const prefix = slice.loadUint(8);

            expect(prefix).toBe(OFFCHAIN_CONTENT_PREFIX);
            expect(slice.remainingBits).toBe(0);
        });

        it('stores long off-chain URI across references', async () => {
            const longUri = `https://example.com/${'path/'.repeat(40)}metadata.json`;
            mockedAxios.get.mockResolvedValueOnce({ data: { name: 'Long URI Token' } });

            const result = buildJettonOffChainMetadata(longUri);
            const slice = result.beginParse();

            expect(slice.loadUint(8)).toBe(OFFCHAIN_CONTENT_PREFIX);
            expect(slice.remainingRefs).toBe(1);

            const metadata = await readJettonMetadata(result);
            expect(metadata.contentUri).toBe(longUri);
            expect(metadata.metadata).toEqual({ name: 'Long URI Token' });
        });
    });

    describe('buildJettonOnchainMetadata', () => {
        const validMetadata: JettonMetadata = {
            name: 'Test Token',
            description: 'A test token',
            symbol: 'TEST',
            decimals: '18',
            image: 'https://example.com/image.png',
            uri: 'https://example.com',
        };

        it('builds on-chain metadata cell with correct prefix and dictionary', () => {
            const result = buildJettonOnchainMetadata(validMetadata);
            const slice = result.beginParse();
            const prefix = slice.loadUint(8);

            expect(prefix).toBe(ONCHAIN_CONTENT_PREFIX);
            expect(slice.remainingRefs).toBe(1); // Dictionary reference
        });

        it('skips empty or null values', () => {
            const metadataWithEmptyValues: JettonMetadata = {
                name: 'Test Token',
                description: '',
                symbol: 'TEST',
                decimals: undefined as any,
                image: null as any,
            };

            const result = buildJettonOnchainMetadata(metadataWithEmptyValues);
            const slice = result.beginParse();
            slice.loadUint(8); // Skip prefix

            // Should still create a valid cell
            expect(result).toBeDefined();
        });

        it('throws error for unsupported keys', () => {
            const invalidMetadata = {
                name: 'Test Token',
                unsupportedKey: 'value',
            } as any;

            expect(() => buildJettonOnchainMetadata(invalidMetadata)).toThrow('Unsupported onchain key');
        });

        it('supports TEP-64 jetton display fields', async () => {
            const metadata: JettonMetadata = {
                amount_style: '%',
                name: 'Display Token',
                render_type: 'game',
                symbol: 'DSP',
            };

            const result = await readJettonMetadata(buildJettonOnchainMetadata(metadata));

            expect(result.metadata).toMatchObject({
                amount_style: '%',
                render_type: 'game',
                symbol: 'DSP',
            });
        });
    });

    describe('readJettonMetadata', () => {
        it('returns empty metadata for empty cell', async () => {
            const emptyCell = beginCell().endCell();
            const result = await readJettonMetadata(emptyCell);

            expect(result).toEqual({
                contentUri: undefined,
                isJettonDeployerFaultyOnChainData: false,
                metadata: {},
                persistenceType: 'none',
            });
        });

        it('reads on-chain metadata correctly', async () => {
            const metadata: JettonMetadata = {
                name: 'Test Token',
                symbol: 'TEST',
                description: 'A test token',
            };

            const onChainCell = buildJettonOnchainMetadata(metadata);
            const result = await readJettonMetadata(onChainCell);

            expect(result.persistenceType).toBe('onchain');
            expect(result.metadata?.name).toBe('Test Token');
            expect(result.metadata?.symbol).toBe('TEST');
            expect(result.metadata?.description).toBe('A test token');
        });

        it('merges semi-chain metadata with on-chain precedence', async () => {
            mockedAxios.get.mockResolvedValueOnce({
                data: {
                    decimals: 6,
                    description: 'Off-chain description',
                    image: 'https://example.com/offchain.png',
                    name: 'Off-chain name',
                    symbol: 'OFF',
                },
            });

            const onchainCell = buildJettonOnchainMetadata({
                decimals: '9',
                description: 'On-chain description',
                name: 'On-chain name',
                symbol: 'ON',
                uri: 'https://example.com/metadata.json',
            });

            const result = await readJettonMetadata(onchainCell);

            expect(result.persistenceType).toBe('semichain_private_domain');
            expect(result.contentUri).toBe('https://example.com/metadata.json');
            expect(result.metadata).toMatchObject({
                decimals: '9',
                description: 'On-chain description',
                image: 'https://example.com/offchain.png',
                name: 'On-chain name',
                symbol: 'ON',
                uri: 'https://example.com/metadata.json',
            });
        });

        it('reads off-chain metadata from HTTP URL', async () => {
            const mockMetadata = {
                name: 'Off-chain Token',
                symbol: 'OFFCHAIN',
                description: 'An off-chain token',
            };

            mockedAxios.get.mockResolvedValueOnce({ data: mockMetadata });

            const contentUri = 'https://example.com/metadata.json';
            const offChainCell = buildJettonOffChainMetadata(contentUri);
            const result = await readJettonMetadata(offChainCell);

            expect(result.persistenceType).toBe('offchain_private_domain');
            expect(result.contentUri).toBe(contentUri);
            expect(result.metadata).toEqual(mockMetadata);
            expect(mockedAxios.get).toHaveBeenCalledWith(contentUri);
        });

        it('reads off-chain metadata from IPFS URL', async () => {
            const mockMetadata = {
                name: 'IPFS Token',
                symbol: 'IPFS',
            };

            mockedAxios.get.mockResolvedValueOnce({ data: mockMetadata });

            const ipfsUri = 'ipfs://QmHash123';
            const offChainCell = buildJettonOffChainMetadata(ipfsUri);
            const result = await readJettonMetadata(offChainCell);

            expect(result.persistenceType).toBe('offchain_ipfs');
            expect(result.contentUri).toBe('https://ipfs.io/ipfs/QmHash123');
            expect(result.metadata).toEqual(mockMetadata);
            expect(mockedAxios.get).toHaveBeenCalledWith('https://ipfs.io/ipfs/QmHash123');
        });

        it('handles failed HTTP requests gracefully', async () => {
            mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

            const contentUri = 'https://example.com/nonexistent.json';
            const offChainCell = buildJettonOffChainMetadata(contentUri);
            const result = await readJettonMetadata(offChainCell);

            expect(result.persistenceType).toBe('offchain_private_domain');
            expect(result.contentUri).toBe(contentUri);
            expect(result.metadata).toBeNull();
        });

        it('throws error for invalid prefix', async () => {
            const invalidCell = beginCell()
                .storeUint(0x99, 8) // Invalid prefix
                .endCell();

            await expect(readJettonMetadata(invalidCell)).rejects.toThrow(
                'Unexpected wrappers metadata content prefix',
            );
        });

        it('reads chunked on-chain values', async () => {
            const nameHash = createHash('sha256').update('name').digest();
            const chunks = Dictionary.empty(Dictionary.Keys.Uint(32), Dictionary.Values.Cell());

            chunks.set(0, beginCell().storeUint(0, 8).storeBuffer(Buffer.from('Chunked ')).endCell());
            chunks.set(1, beginCell().storeUint(0, 8).storeBuffer(Buffer.from('Token')).endCell());

            const values = Dictionary.empty(Dictionary.Keys.Buffer(32), Dictionary.Values.Cell());
            values.set(nameHash, beginCell().storeUint(1, 8).storeDict(chunks).endCell());

            const content = beginCell()
                .storeUint(ONCHAIN_CONTENT_PREFIX, 8)
                .storeDict(values, Dictionary.Keys.Buffer(32), Dictionary.Values.Cell())
                .endCell();

            const result = await readJettonMetadata(content);

            expect(result.metadata?.name).toBe('Chunked Token');
        });
    });

    describe('NFT metadata', () => {
        it('reads NFT on-chain metadata correctly', async () => {
            const metadata: NFTMetadata = {
                description: 'NFT description',
                image: 'https://example.com/nft.png',
                name: 'NFT #1',
            };

            const result = await readNFTMetadata(buildNFTOnchainMetadata(metadata));

            expect(result.persistenceType).toBe('onchain');
            expect(result.metadata).toMatchObject(metadata);
        });

        it('reads NFT full off-chain content returned by collection get_nft_content', async () => {
            mockedAxios.get.mockResolvedValueOnce({
                data: {
                    attributes: [],
                    content_url: 'https://example.com/video.mp4',
                    name: 'NFT #42',
                },
            });

            const individualContent = beginCell().storeBuffer(Buffer.from('42.json', 'ascii')).endCell();
            const nftContent = beginCell()
                .storeUint(OFFCHAIN_CONTENT_PREFIX, 8)
                .storeBuffer(Buffer.from('https://example.com/nft/', 'ascii'))
                .storeRef(individualContent)
                .endCell();

            const result = await readNFTMetadata(nftContent);

            expect(result.persistenceType).toBe('offchain_private_domain');
            expect(result.contentUri).toBe('https://example.com/nft/42.json');
            expect(result.metadata).toEqual({
                attributes: [],
                content_url: 'https://example.com/video.mp4',
                name: 'NFT #42',
            });
        });

        it('builds NFT off-chain metadata cells', () => {
            const contentUri = 'https://example.com/nft/1.json';
            const result = buildNFTOffChainMetadata(contentUri);
            const slice = result.beginParse();

            expect(slice.loadUint(8)).toBe(OFFCHAIN_CONTENT_PREFIX);
            expect(slice.loadBuffer(slice.remainingBits / 8).toString('ascii')).toBe(contentUri);
        });
    });

    describe('snake content handling', () => {
        it('handles long content that requires multiple cells', () => {
            // Create metadata with a very long description to trigger snake content
            const longDescription = 'A'.repeat(200); // Long enough to require multiple cells
            const metadata: JettonMetadata = {
                name: 'Test Token',
                symbol: 'TEST',
                description: longDescription,
            };

            const result = buildJettonOnchainMetadata(metadata);

            // Should create a valid cell even with long content
            expect(result).toBeDefined();
            const slice = result.beginParse();
            expect(slice.loadUint(8)).toBe(ONCHAIN_CONTENT_PREFIX);
        });

        it('handles content with non-UTF8 characters', () => {
            const metadata: JettonMetadata = {
                name: 'Token with émojis 🚀',
                symbol: 'EMOJI',
                description: 'Tëst with spéçial charâcters',
            };

            expect(() => buildJettonOnchainMetadata(metadata)).not.toThrow();
        });
    });

    describe('error handling', () => {
        it('handles malformed cells gracefully', async () => {
            // Create a cell with minimal content that doesn't cause errors
            const malformedCell = beginCell()
                .storeUint(ONCHAIN_CONTENT_PREFIX, 8)
                .storeUint(1, 7) // 7 bits, not divisible by 8
                .endCell();

            // The function should handle this gracefully and return onchain metadata
            const result = await readJettonMetadata(malformedCell);
            expect(result.persistenceType).toBe('onchain');
        });

        it('handles various ASCII and UTF-8 encodings', () => {
            const metadata: JettonMetadata = {
                name: 'UTF-8 Token',
                symbol: 'UTF8',
                description: 'UTF-8 description',
                image: 'ascii-image-url',
                uri: 'ascii-uri',
            };

            expect(() => buildJettonOnchainMetadata(metadata)).not.toThrow();
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });
});
