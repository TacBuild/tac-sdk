import '@ton/test-utils';

import { Address, beginCell, Message, storeMessage, Transaction } from '@ton/ton';

import { Network, TonClient4Opener, tonHubApi4Opener } from '../../../src';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('TonClient4Opener Integration Tests', () => {
    let opener: TonClient4Opener;
    // Known mainnet address with transactions (TAC CCL)
    const testAddress = Address.parse('EQAgpWmO8nBUrmfOOldIEmRkLEwV-IIfVAlJsphYswnuL80R');

    beforeAll(async () => {
        opener = TonClient4Opener.create('https://mainnet-v4.tonhubapi.com');
    }, 30000);

    afterEach(async () => {
        // Add delay between tests to avoid rate limiting
        await sleep(1500);
    });

    describe('create', () => {
        it('should create TonClient4Opener instance for mainnet', () => {
            const instance = TonClient4Opener.create('https://mainnet-v4.tonhubapi.com');
            expect(instance).toBeInstanceOf(TonClient4Opener);
        });

        it('should create TonClient4Opener instance for testnet', () => {
            const instance = TonClient4Opener.create('https://testnet-v4.tonhubapi.com');
            expect(instance).toBeInstanceOf(TonClient4Opener);
        });

        it('should create TonClient4Opener with custom timeout', () => {
            const instance = TonClient4Opener.create('https://mainnet-v4.tonhubapi.com', 20000);
            expect(instance).toBeInstanceOf(TonClient4Opener);
        });
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
        // Note: TonHub public v4 API has issues with getAccountTransactions
        // It returns 404 or timeout errors. This is a known limitation.
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

        it.skip('should fetch transactions with specific limit', async () => {
            const txs = await opener.getTransactions(testAddress, { limit: 3 });

            expect(txs.length).toBeLessThanOrEqual(3);
        }, 15000);

        it.skip('should fetch transactions with lt and hash parameters', async () => {
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
        }, 20000);
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
        // Note: TonHub public v4 API has timeout issues with getConfig
        it.skip('should fetch blockchain config from mainnet', async () => {
            const config = await opener.getConfig();

            expect(config).toBeDefined();
            expect(typeof config).toBe('string');
            expect(config.length).toBeGreaterThan(0);
        }, 15000);
    });

    describe('getTransactionByHash', () => {
        it.skip('should fetch specific transaction by hash', async () => {
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

    describe('getTransactionByTxHash', () => {
        it.skip('should fetch transaction by transaction hash only', async () => {
            const txs = await opener.getTransactions(testAddress, { limit: 1 });
            expect(txs.length).toBeGreaterThan(0);

            const targetTx = txs[0];
            const txHash = targetTx.hash().toString('base64');

            const fetchedTx = await opener.getTransactionByTxHash(testAddress, txHash);

            expect(fetchedTx).toBeDefined();
            expect(fetchedTx?.hash().toString('base64')).toBe(txHash);
        }, 20000);
    });

    describe('getTransactionByInMsgHash', () => {
        it.skip('should fetch transaction by incoming message hash', async () => {
            const txs = await opener.getTransactions(testAddress, { limit: 10 });

            const txWithInMsg = txs.find((tx: Transaction) => tx.inMessage !== undefined);
            expect(txWithInMsg).toBeDefined();

            const inMsg = txWithInMsg!.inMessage!;
            const msgHashB64 = beginCell().store(storeMessage(inMsg)).endCell().hash().toString('base64');

            const fetchedTx = await opener.getTransactionByInMsgHash(testAddress, msgHashB64);

            expect(fetchedTx).toBeDefined();
            expect(fetchedTx?.hash().toString('base64')).toBe(txWithInMsg!.hash().toString('base64'));
        }, 20000);
    });

    describe('getTransactionByOutMsgHash', () => {
        it.skip('should fetch transaction by outgoing message hash', async () => {
            const txs = await opener.getTransactions(testAddress, { limit: 10 });

            const txWithOutMsg = txs.find((tx: Transaction) => tx.outMessages.size > 0);
            expect(txWithOutMsg).toBeDefined();

            const outMsg = Array.from(txWithOutMsg!.outMessages.values())[0] as Message;
            const msgHashB64 = beginCell().store(storeMessage(outMsg)).endCell().hash().toString('base64');

            const fetchedTx = await opener.getTransactionByOutMsgHash(testAddress, msgHashB64);

            expect(fetchedTx).toBeDefined();
            expect(fetchedTx?.hash().toString('base64')).toBe(txWithOutMsg!.hash().toString('base64'));
        }, 20000);
    });

    describe('getAdjacentTransactions', () => {
        it.skip('should fetch adjacent transactions', async () => {
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
        it.skip('should validate transaction tree without errors for successful transaction', async () => {
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

        it.skip('should validate transaction tree with custom parameters', async () => {
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

    describe('trackTransactionTreeWithResult', () => {
        it.skip('should return success for valid transaction tree', async () => {
            const txs = await opener.getTransactions(testAddress, { limit: 1 });
            expect(txs.length).toBeGreaterThan(0);

            const tx = txs[0];
            const txHash = tx.hash().toString('base64');

            const result = await opener.trackTransactionTreeWithResult(testAddress.toString(), txHash, {
                maxDepth: 10,
            });

            expect(result).toBeDefined();
            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();
        }, 30000);
    });

    describe('tonClient4Opener factory', () => {
        it('should create opener using factory function for mainnet', () => {
            const openerFromFactory = tonHubApi4Opener(Network.MAINNET);

            expect(openerFromFactory).toBeDefined();
        });

        it('should create opener using factory function for testnet', () => {
            const openerFromFactory = tonHubApi4Opener(Network.TESTNET);

            expect(openerFromFactory).toBeDefined();
        });

        it('should create opener with custom timeout using factory', async () => {
            const openerFromFactory = tonHubApi4Opener(Network.MAINNET, 20000);

            const state = await openerFromFactory.getContractState(testAddress);
            expect(state).toBeDefined();
        }, 30000);

        it('should fetch contract state using factory-created opener', async () => {
            const openerFromFactory = tonHubApi4Opener(Network.MAINNET);

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
            expect(typeof opener.getTransactionByTxHash).toBe('function');
            expect(typeof opener.getTransactionByInMsgHash).toBe('function');
            expect(typeof opener.getTransactionByOutMsgHash).toBe('function');
            expect(typeof opener.getAdjacentTransactions).toBe('function');
            expect(typeof opener.trackTransactionTree).toBe('function');
            expect(typeof opener.trackTransactionTreeWithResult).toBe('function');
        });
    });
});
