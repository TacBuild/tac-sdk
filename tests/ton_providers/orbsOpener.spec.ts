import '@ton/test-utils';

import { Address } from '@ton/ton';

import { Network,OrbsOpener, orbsOpener } from '../../src';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('OrbsOpener Integration Tests', () => {
    let opener: OrbsOpener;
    // Known mainnet address with transactions (TAC CCL)
    const testAddress = Address.parse('EQAgpWmO8nBUrmfOOldIEmRkLEwV-IIfVAlJsphYswnuL80R');

    beforeAll(async () => {
        opener = await OrbsOpener.create(Network.MAINNET);
    }, 30000);

    afterEach(async () => {
        // Add delay between tests to avoid rate limiting
        await sleep(1500);
    });

    describe('create', () => {
        it('should create OrbsOpener instance for testnet', async () => {
            const instance = await OrbsOpener.create(Network.TESTNET);
            expect(instance).toBeInstanceOf(OrbsOpener);
        }, 30000);

        it('should create OrbsOpener instance for mainnet', async () => {
            const instance = await OrbsOpener.create(Network.MAINNET);
            expect(instance).toBeInstanceOf(OrbsOpener);
        }, 30000);
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
        }, 35000);
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

    describe('getAdjacentTransactions', () => {
        it('should fetch adjacent transactions', async () => {
            // Get a transaction first
            const txs = await opener.getTransactions(testAddress, { limit: 5 });
            expect(txs.length).toBeGreaterThan(1);

            const targetTx = txs[1]; // Use second transaction to ensure there are adjacent ones
            const txHash = targetTx.hash().toString('base64');

            // Get adjacent transactions
            const adjacentTxs = await opener.getAdjacentTransactions(testAddress, txHash, { timeoutMs: 10000 });

            expect(adjacentTxs).toBeDefined();
            expect(Array.isArray(adjacentTxs)).toBe(true);
            // Adjacent transactions include the target transaction
            expect(adjacentTxs.length).toBeGreaterThanOrEqual(1);
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

        it('should validate transaction tree with custom parameters', async () => {
            const txs = await opener.getTransactions(testAddress, { limit: 1 });
            expect(txs.length).toBeGreaterThan(0);

            const tx = txs[0];
            const txHash = tx.hash().toString('base64');

            // Track with custom max depth and ignore opcodes
            await expect(
                opener.trackTransactionTree(testAddress.toString(), txHash, {
                    maxDepth: 5,
                    ignoreOpcodeList: [0xd53276db], // Excess opcode
                }),
            ).resolves.not.toThrow();
        }, 30000);
    });

    describe('orbsOpener factory', () => {
        it('should create opener using factory function', async () => {
            const openerFromFactory = await orbsOpener(Network.MAINNET);

            const state = await openerFromFactory.getContractState(testAddress);
            expect(state).toBeDefined();
            expect(state.balance).toBeDefined();
        }, 30000);
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
