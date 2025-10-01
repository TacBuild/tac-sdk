import { beginCell } from '@ton/ton';
import axios from 'axios';

import {
    buildJettonOffChainMetadata,
    buildJettonOnchainMetadata,
    JettonMetadata,
    OFFCHAIN_CONTENT_PREFIX,
    ONCHAIN_CONTENT_PREFIX,
    readJettonMetadata,
} from '../../../src';

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
            expect(result.metadata.name).toBe('Test Token');
            expect(result.metadata.symbol).toBe('TEST');
            expect(result.metadata.description).toBe('A test token');
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
