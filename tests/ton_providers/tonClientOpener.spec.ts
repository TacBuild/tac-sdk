import '@ton/test-utils';

import { Address, TonClient } from '@ton/ton';

import { TonClientOpener,  } from '../../src';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('TonClientOpener Integration Tests', () => {
    let opener: TonClientOpener;
    // Known mainnet address with transactions (TAC CCL)
    const testAddress = Address.parse('EQAgpWmO8nBUrmfOOldIEmRkLEwV-IIfVAlJsphYswnuL80R');

    beforeAll(async () => {
        const endpoint = 'https://rp.mainnet.tac.build/api/v2/jsonRPC';
        opener = new TonClientOpener(new TonClient({ endpoint }));
    }, 30000);

    afterEach(async () => {
        // Add delay between tests to avoid rate limiting
        await sleep(1000);
    });

    describe('getContractState', () => {
        it('should fetch real contract state from mainnet', async () => {
            const state = await opener.getContractState(testAddress);

            expect(state).toBeDefined();
            expect(state.balance).toBeDefined();
            expect(typeof state.balance).toBe('bigint');
            expect(state.state).toBeDefined();
            expect(['active', 'uninitialized', 'frozen']).toContain(state.state);
        }, 15000);
    });

    describe('getTransactions', () => {
        it('should fetch real transactions from mainnet', async () => {
            const txs = await opener.getTransactions(testAddress, { limit: 5 });

            expect(txs).toBeDefined();
            expect(Array.isArray(txs)).toBe(true);
            expect(txs.length).toBeGreaterThan(0);
            expect(txs.length).toBeLessThanOrEqual(5);

            // Verify transaction structure
            const firstTx = txs[0];
            expect(firstTx).toBeDefined();
            expect(firstTx.hash()).toBeDefined();
            expect(firstTx.lt).toBeDefined();
        }, 15000);

        it('should fetch transactions with specific limit', async () => {
            const txs = await opener.getTransactions(testAddress, { limit: 3 });

            expect(txs.length).toBeLessThanOrEqual(3);
        }, 15000);
    });

    describe('getAddressInformation', () => {
        it('should fetch address information from mainnet', async () => {
            const info = await opener.getAddressInformation(testAddress);

            expect(info).toBeDefined();
            expect(info.lastTransaction).toBeDefined();
            expect(info.lastTransaction.lt).toBeDefined();
            expect(info.lastTransaction.hash).toBeDefined();
        }, 15000);
    });

    describe('getConfig', () => {
        it('should fetch blockchain config from mainnet or throw meaningful error', async () => {
            try {
                const config = await opener.getConfig();
                expect(config).toBeDefined();
                expect(typeof config).toBe('string');
                expect(config.length).toBeGreaterThan(0);
            } catch (error: unknown) {
                // API may be unavailable, check that error is meaningful
                expect(error).toBeDefined();
                expect((error as Error).message).toContain('Failed to fetch config');
            }
        }, 15000);
    });

    describe('getTransactionByHash', () => {
        it('should fetch specific transaction by hash', async () => {
            // First get a transaction to get its hash
            const txs = await opener.getTransactions(testAddress, { limit: 1 });
            expect(txs.length).toBeGreaterThan(0);

            const targetTx = txs[0];
            const txHash = targetTx.hash().toString('base64');

            // Now fetch it by hash
            const fetchedTx = await opener.getTransactionByHash(testAddress, txHash);

            expect(fetchedTx).toBeDefined();
            expect(fetchedTx?.hash().toString('base64')).toBe(txHash);
        }, 20000);
    });

    describe('trackTransactionTree', () => {
        it('should validate transaction tree without errors for successful transaction', async () => {
            // Get a recent transaction
            const txs = await opener.getTransactions(testAddress, { limit: 1 });
            expect(txs.length).toBeGreaterThan(0);

            const tx = txs[0];
            const txHash = tx.hash().toString('base64');

            // Track transaction tree - should not throw for valid transaction
            await expect(
                opener.trackTransactionTree(testAddress.toString(), txHash, {
                    maxDepth: 10,
                }),
            ).resolves.not.toThrow();
        }, 30000);

        it('should throw error for non-existent transaction', async () => {
            const fakeHash = Buffer.alloc(32, 0).toString('base64');

            await expect(
                opener.trackTransactionTree(testAddress.toString(), fakeHash, {
                    maxDepth: 5,
                }),
            ).rejects.toThrow();
        }, 20000);
    });

    describe('factory pattern', () => {
        it('should create opener from TonClient instance', async () => {
            const client = new TonClient({ endpoint: 'https://toncenter.com/api/v2/jsonRPC' });
            const openerFromFactory = new TonClientOpener(client);

            const state = await openerFromFactory.getContractState(testAddress);
            expect(state).toBeDefined();
            expect(state.balance).toBeDefined();
        }, 15000);
    });

    describe('inherited methods from BaseContractOpener', () => {
        it('should have all required methods', () => {
            expect(typeof opener.open).toBe('function');
            expect(typeof opener.getContractState).toBe('function');
            expect(typeof opener.getTransactions).toBe('function');
            expect(typeof opener.getAddressInformation).toBe('function');
            expect(typeof opener.getConfig).toBe('function');
            expect(typeof opener.getTransactionByHash).toBe('function');
            expect(typeof opener.getAdjacentTransactions).toBe('function');
            expect(typeof opener.trackTransactionTree).toBe('function');
        });
    });
});
