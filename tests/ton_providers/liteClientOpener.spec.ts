import '@ton/test-utils';

import { Address } from '@ton/ton';

import { LiteClientOpener, liteClientOpener, Network } from '../../src';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('LiteClientOpener Integration Tests', () => {
    let opener: LiteClientOpener;
    // Known mainnet address with transactions (TAC CCL)
    const testAddress = Address.parse('EQAgpWmO8nBUrmfOOldIEmRkLEwV-IIfVAlJsphYswnuL80R');

    beforeAll(async () => {
        opener = await LiteClientOpener.create({ network: Network.MAINNET });
    }, 60000);

    afterEach(async () => {
        // Add delay between tests to avoid rate limiting
        await sleep(2000);
    });

    afterAll(() => {
        if (opener) {
            opener.closeConnections();
        }
    });

    describe('create', () => {
        it('should create LiteClientOpener instance for mainnet', async () => {
            const instance = await LiteClientOpener.create({ network: Network.MAINNET });
            expect(instance).toBeInstanceOf(LiteClientOpener);
            instance.closeConnections();
        }, 60000);

        it('should create LiteClientOpener instance for mainnet', async () => {
            const instance = await LiteClientOpener.create({ network: Network.MAINNET });
            expect(instance).toBeInstanceOf(LiteClientOpener);
            instance.closeConnections();
        }, 60000);
    });

    describe('getContractState', () => {
        it('should fetch real contract state from mainnet', async () => {
            const state = await opener.getContractState(testAddress);

            expect(state).toBeDefined();
            expect(state.balance).toBeDefined();
            expect(typeof state.balance).toBe('bigint');
            expect(state.state).toBeDefined();
            expect(['active', 'uninitialized', 'frozen']).toContain(state.state);
        }, 20000);
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
        }, 20000);

        it('should fetch transactions with specific limit', async () => {
            const txs = await opener.getTransactions(testAddress, { limit: 3 });

            expect(txs.length).toBeLessThanOrEqual(3);
        }, 20000);

        it('should fetch transactions with lt and hash parameters', async () => {
            // First get a transaction to use its lt and hash
            const firstBatch = await opener.getTransactions(testAddress, { limit: 1 });
            expect(firstBatch.length).toBeGreaterThan(0);

            const lastTx = firstBatch[0];
            const lt = lastTx.lt.toString();
            const hash = lastTx.hash().toString('base64');

            // Fetch more transactions starting from this point
            const nextBatch = await opener.getTransactions(testAddress, {
                limit: 5,
                lt,
                hash,
            });

            expect(nextBatch).toBeDefined();
            expect(Array.isArray(nextBatch)).toBe(true);
        }, 30000);
    });

    describe('getAddressInformation', () => {
        it('should fetch address information from mainnet', async () => {
            const info = await opener.getAddressInformation(testAddress);

            expect(info).toBeDefined();
            expect(info.lastTransaction).toBeDefined();
            expect(info.lastTransaction.lt).toBeDefined();
            expect(info.lastTransaction.hash).toBeDefined();
        }, 20000);
    });

    describe('getConfig', () => {
        it('should fetch blockchain config from mainnet', async () => {
            const config = await opener.getConfig();

            expect(config).toBeDefined();
            expect(typeof config).toBe('string');
            expect(config.length).toBeGreaterThan(0);
        }, 20000);
    });

    describe('getTransactionByHash', () => {
        it('should fetch specific transaction by hash', async () => {
            // First get a transaction to get its hash
            const txs = await opener.getTransactions(testAddress, { limit: 1 });
            expect(txs.length).toBeGreaterThan(0);

            const targetTx = txs[0];
            const txHash = targetTx.hash().toString('base64');

            // Now fetch it by hash
            const fetchedTx = await opener.getTransactionByHash(testAddress, txHash, {timeoutMs: 5000});

            expect(fetchedTx).toBeDefined();
            expect(fetchedTx?.hash().toString('base64')).toBe(txHash);
        }, 30000);
    });

    describe('getAdjacentTransactions', () => {
        it('should fetch adjacent transactions', async () => {
            // Get a transaction first
            const txs = await opener.getTransactions(testAddress, { limit: 5 });
            expect(txs.length).toBeGreaterThan(1);

            const targetTx = txs[1]; // Use second transaction to ensure there are adjacent ones
            const txHash = targetTx.hash().toString('base64');

            // Get adjacent transactions
            const adjacentTxs = await opener.getAdjacentTransactions(testAddress, txHash, { timeoutMs: 1000 });

            expect(adjacentTxs).toBeDefined();
            expect(Array.isArray(adjacentTxs)).toBe(true);
            // Adjacent transactions include the target transaction
            expect(adjacentTxs.length).toBeGreaterThanOrEqual(1);
        }, 60000);
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
        }, 40000);

        it('should throw error for non-existent transaction', async () => {
            const fakeHash = Buffer.alloc(32, 0).toString('base64');

            await expect(
                opener.trackTransactionTree(testAddress.toString(), fakeHash, {
                    maxDepth: 5,
                }),
            ).rejects.toThrow();
        }, 30000);

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
        }, 40000);
    });

    describe('closeConnections', () => {
        it('should close lite client connections', async () => {
            const tempOpener = await LiteClientOpener.create({ network: Network.MAINNET });

            // Should not throw when closing connections
            expect(() => tempOpener.closeConnections()).not.toThrow();
        }, 60000);
    });

    describe('liteClientOpener factory', () => {
        it('should create opener using factory function', async () => {
            const openerFromFactory = await liteClientOpener({ network: Network.MAINNET });

            const state = await openerFromFactory.getContractState(testAddress);
            expect(state).toBeDefined();
            expect(state.balance).toBeDefined();

            if (openerFromFactory.closeConnections) {
                openerFromFactory.closeConnections();
            }
        }, 60000);
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
            expect(typeof opener.closeConnections).toBe('function');
        });
    });
});