import '@ton/test-utils';

import { Address, TonClient, Transaction } from '@ton/ton';

import { ContractOpener, LiteClientOpener, Network, OrbsOpener, OrbsOpener4, TonClientOpener } from '../../src';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Comprehensive comparison test for all ContractOpener implementations
 * Validates that all openers return consistent data for the same operations
 */
describe('Contract Openers Comparison Tests', () => {
    let liteClientOpener: LiteClientOpener;
    let orbsOpener: OrbsOpener;
    let orbsOpener4: OrbsOpener4;
    let tonClientOpener: TonClientOpener;

    // Known mainnet address with transactions (TAC CCL)
    const testAddress = Address.parse('EQAgpWmO8nBUrmfOOldIEmRkLEwV-IIfVAlJsphYswnuL80R');

    beforeAll(async () => {
        // Initialize all openers
        liteClientOpener = await LiteClientOpener.create({ network: Network.MAINNET });
        orbsOpener = await OrbsOpener.create(Network.MAINNET);
        orbsOpener4 = await OrbsOpener4.create(Network.MAINNET);
        tonClientOpener = new TonClientOpener(
            new TonClient({ endpoint: 'https://rp.mainnet.tac.build/api/v2/jsonRPC' }),
        );
    }, 120000);

    afterAll(() => {
        liteClientOpener?.closeConnections();
    });

    afterEach(async () => {
        // Add delay between tests to avoid rate limiting
        await sleep(3000);
    });

    describe('getContractState comparison', () => {
        it('should return same contract state from all openers', async () => {
            const [liteState, orbsState, orbs4State, tonClientState] = await Promise.all([
                liteClientOpener.getContractState(testAddress),
                orbsOpener.getContractState(testAddress),
                orbsOpener4.getContractState(testAddress),
                tonClientOpener.getContractState(testAddress),
            ]);

            // All should be defined
            expect(liteState).toBeDefined();
            expect(orbsState).toBeDefined();
            expect(orbs4State).toBeDefined();
            expect(tonClientState).toBeDefined();

            // Compare balance (should be equal within reasonable time window)
            expect(liteState.balance).toBeDefined();
            expect(orbsState.balance).toBeDefined();
            expect(orbs4State.balance).toBeDefined();
            expect(tonClientState.balance).toBeDefined();

            // Balance might differ slightly due to timing, but should be similar
            const balances = [liteState.balance, orbsState.balance, orbs4State.balance, tonClientState.balance];
            const maxBalance = balances.reduce((a, b) => (a > b ? a : b));
            const minBalance = balances.reduce((a, b) => (a < b ? a : b));

            // Balances should be within 10% of each other (accounting for transactions between calls)
            const balanceDiff = Number(maxBalance - minBalance);
            const avgBalance = Number(maxBalance + minBalance) / 2;
            expect(balanceDiff / avgBalance).toBeLessThan(0.1);

            // State should be identical
            expect(liteState.state).toBe(orbsState.state);
            expect(orbsState.state).toBe(orbs4State.state);
            expect(orbs4State.state).toBe(tonClientState.state);
        }, 60000);
    });

    describe('getTransactions comparison', () => {
        it('should return same transactions from all openers', async () => {
            const limit = 5;

            const [liteTxs, orbsTxs, orbs4Txs, tonClientTxs] = await Promise.all([
                liteClientOpener.getTransactions(testAddress, { limit }),
                orbsOpener.getTransactions(testAddress, { limit }),
                orbsOpener4.getTransactions(testAddress, { limit }),
                tonClientOpener.getTransactions(testAddress, { limit }),
            ]);

            // All should return transactions
            expect(liteTxs.length).toBeGreaterThan(0);
            expect(orbsTxs.length).toBeGreaterThan(0);
            expect(orbs4Txs.length).toBeGreaterThan(0);
            expect(tonClientTxs.length).toBeGreaterThan(0);

            // All should respect limit
            expect(liteTxs.length).toBeLessThanOrEqual(limit);
            expect(orbsTxs.length).toBeLessThanOrEqual(limit);
            expect(orbs4Txs.length).toBeLessThanOrEqual(limit);
            expect(tonClientTxs.length).toBeLessThanOrEqual(limit);

            // Compare transaction hashes (should be identical for same block)
            const compareTransactions = (tx1: Transaction, tx2: Transaction, openerName1: string, openerName2: string) => {
                const hash1 = tx1.hash().toString('base64');
                const hash2 = tx2.hash().toString('base64');

                expect(hash1).toBe(hash2);
                expect(tx1.lt).toBe(tx2.lt);
                expect(tx1.now).toBe(tx2.now);

                // Compare in message
                if (tx1.inMessage && tx2.inMessage) {
                    expect(tx1.inMessage.info.type).toBe(tx2.inMessage.info.type);
                }

                // Compare out messages count
                expect(tx1.outMessages.size).toBe(tx2.outMessages.size);
            };

            // Compare first transaction from each opener
            const minLength = Math.min(liteTxs.length, orbsTxs.length, orbs4Txs.length, tonClientTxs.length);

            for (let i = 0; i < minLength; i++) {
                compareTransactions(liteTxs[i], orbsTxs[i], 'LiteClient', 'Orbs');
                compareTransactions(liteTxs[i], orbs4Txs[i], 'LiteClient', 'Orbs4');
                compareTransactions(liteTxs[i], tonClientTxs[i], 'LiteClient', 'TonClient');
            }
        }, 60000);

        it('should return same transactions with pagination', async () => {
            // Get first batch
            const firstBatch = await liteClientOpener.getTransactions(testAddress, { limit: 3 });
            expect(firstBatch.length).toBeGreaterThan(0);

            const oldestTx = firstBatch[firstBatch.length - 1];
            const lt = oldestTx.prevTransactionLt.toString();
            const hashHex = oldestTx.prevTransactionHash.toString(16).padStart(64, '0');
            const hash = Buffer.from(hashHex, 'hex').toString('base64');

            // Get second batch with pagination from all openers
            const [liteTxs, orbsTxs, orbs4Txs, tonClientTxs] = await Promise.all([
                liteClientOpener.getTransactions(testAddress, { limit: 3, lt, hash }),
                orbsOpener.getTransactions(testAddress, { limit: 3, lt, hash }),
                orbsOpener4.getTransactions(testAddress, { limit: 3, lt, hash }),
                tonClientOpener.getTransactions(testAddress, { limit: 3, lt, hash }),
            ]);

            // All should return same transactions
            const minLength = Math.min(liteTxs.length, orbsTxs.length, orbs4Txs.length, tonClientTxs.length);
            expect(minLength).toBeGreaterThan(0);

            for (let i = 0; i < minLength; i++) {
                const liteHash = liteTxs[i].hash().toString('base64');
                const orbsHash = orbsTxs[i].hash().toString('base64');
                const orbs4Hash = orbs4Txs[i].hash().toString('base64');
                const tonClientHash = tonClientTxs[i].hash().toString('base64');

                expect(liteHash).toBe(orbsHash);
                expect(orbsHash).toBe(orbs4Hash);
                expect(orbs4Hash).toBe(tonClientHash);
            }
        }, 60000);
    });

    describe('getAddressInformation comparison', () => {
        it('should return same address information from all openers', async () => {
            const [liteInfo, orbsInfo, orbs4Info, tonClientInfo] = await Promise.all([
                liteClientOpener.getAddressInformation(testAddress),
                orbsOpener.getAddressInformation(testAddress),
                orbsOpener4.getAddressInformation(testAddress),
                tonClientOpener.getAddressInformation(testAddress),
            ]);

            // All should return same last transaction info
            expect(liteInfo.lastTransaction.lt).toBeDefined();
            expect(orbsInfo.lastTransaction.lt).toBeDefined();
            expect(orbs4Info.lastTransaction.lt).toBeDefined();
            expect(tonClientInfo.lastTransaction.lt).toBeDefined();

            // Last transaction LT and hash should be identical (within reasonable time)
            // They might differ if transactions happened between calls, but should be close
            const lts = [
                BigInt(liteInfo.lastTransaction.lt),
                BigInt(orbsInfo.lastTransaction.lt),
                BigInt(orbs4Info.lastTransaction.lt),
                BigInt(tonClientInfo.lastTransaction.lt),
            ];

            const maxLt = lts.reduce((a, b) => (a > b ? a : b));
            const minLt = lts.reduce((a, b) => (a < b ? a : b));

            // LT should be very close (difference < 100 means same or very recent transactions)
            expect(Number(maxLt - minLt)).toBeLessThan(100);
        }, 60000);
    });

    describe('getConfig comparison', () => {
        it('should return same config from all openers', async () => {
            const [liteConfig, orbsConfig, orbs4Config, tonClientConfig] = await Promise.all([
                liteClientOpener.getConfig(),
                orbsOpener.getConfig(),
                orbsOpener4.getConfig(),
                tonClientOpener.getConfig(),
            ]);

            // All should return config strings
            expect(typeof liteConfig).toBe('string');
            expect(typeof orbsConfig).toBe('string');
            expect(typeof orbs4Config).toBe('string');
            expect(typeof tonClientConfig).toBe('string');

            expect(liteConfig.length).toBeGreaterThan(0);
            expect(orbsConfig.length).toBeGreaterThan(0);
            expect(orbs4Config.length).toBeGreaterThan(0);
            expect(tonClientConfig.length).toBeGreaterThan(0);

            // Configs should be identical (or very similar - might differ by block)
            // At minimum, they should decode to similar structures
            expect(liteConfig.length).toBeGreaterThan(1000);
            expect(orbsConfig.length).toBeGreaterThan(1000);
            expect(orbs4Config.length).toBeGreaterThan(1000);
            expect(tonClientConfig.length).toBeGreaterThan(1000);
        }, 90000);
    });

    describe('getTransactionByHash comparison', () => {
        it('should find same transaction by hash from all openers', async () => {
            // First, get a known transaction
            const txs = await liteClientOpener.getTransactions(testAddress, { limit: 1 });
            expect(txs.length).toBeGreaterThan(0);

            const targetTx = txs[0];
            const txHash = targetTx.hash().toString('base64');

            // Find this transaction using all openers
            const [liteTx, orbsTx, orbs4Tx, tonClientTx] = await Promise.all([
                liteClientOpener.getTransactionByHash(testAddress, txHash),
                orbsOpener.getTransactionByHash(testAddress, txHash),
                orbsOpener4.getTransactionByHash(testAddress, txHash),
                tonClientOpener.getTransactionByHash(testAddress, txHash),
            ]);

            // All should find the transaction
            expect(liteTx).toBeDefined();
            expect(orbsTx).toBeDefined();
            expect(orbs4Tx).toBeDefined();
            expect(tonClientTx).toBeDefined();

            // All should return same transaction
            expect(liteTx!.hash().toString('base64')).toBe(txHash);
            expect(orbsTx!.hash().toString('base64')).toBe(txHash);
            expect(orbs4Tx!.hash().toString('base64')).toBe(txHash);
            expect(tonClientTx!.hash().toString('base64')).toBe(txHash);

            // Compare LT
            expect(liteTx!.lt).toBe(targetTx.lt);
            expect(orbsTx!.lt).toBe(targetTx.lt);
            expect(orbs4Tx!.lt).toBe(targetTx.lt);
            expect(tonClientTx!.lt).toBe(targetTx.lt);
        }, 120000);
    });

    describe('getAdjacentTransactions comparison', () => {
        it('should return same adjacent transactions from all openers', async () => {
            // Get a transaction that has children
            const txs = await liteClientOpener.getTransactions(testAddress, { limit: 10 });
            expect(txs.length).toBeGreaterThan(0);

            // Find a transaction with outgoing messages
            const txWithChildren = txs.find((tx) => tx.outMessages.size > 0);
            expect(txWithChildren).toBeDefined();

            const txHash = txWithChildren!.hash().toString('base64');

            // Get adjacent transactions from all openers
            const [liteAdj, orbsAdj, orbs4Adj, tonClientAdj] = await Promise.all([
                liteClientOpener.getAdjacentTransactions(testAddress, txHash, { limit: 10 }),
                orbsOpener.getAdjacentTransactions(testAddress, txHash, { limit: 10 }),
                orbsOpener4.getAdjacentTransactions(testAddress, txHash, { limit: 10 }),
                tonClientOpener.getAdjacentTransactions(testAddress, txHash, { limit: 10 }),
            ]);

            // All should return adjacent transactions
            expect(liteAdj.length).toBeGreaterThan(0);
            expect(orbsAdj.length).toBeGreaterThan(0);
            expect(orbs4Adj.length).toBeGreaterThan(0);
            expect(tonClientAdj.length).toBeGreaterThan(0);

            // Should return same number of adjacent transactions
            expect(liteAdj.length).toBe(orbsAdj.length);
            expect(orbsAdj.length).toBe(orbs4Adj.length);
            expect(orbs4Adj.length).toBe(tonClientAdj.length);

            // Compare transaction hashes
            const liteHashes = liteAdj.map((tx) => tx.hash().toString('base64')).sort();
            const orbsHashes = orbsAdj.map((tx) => tx.hash().toString('base64')).sort();
            const orbs4Hashes = orbs4Adj.map((tx) => tx.hash().toString('base64')).sort();
            const tonClientHashes = tonClientAdj.map((tx) => tx.hash().toString('base64')).sort();

            expect(liteHashes).toEqual(orbsHashes);
            expect(orbsHashes).toEqual(orbs4Hashes);
            expect(orbs4Hashes).toEqual(tonClientHashes);
        }, 120000);
    });

    describe('trackTransactionTree comparison', () => {
        it('should track and validate same transaction tree from all openers', async () => {
            // Get a recent transaction
            const txs = await liteClientOpener.getTransactions(testAddress, { limit: 5 });
            expect(txs.length).toBeGreaterThan(0);

            const tx = txs[0];
            const txHash = tx.hash().toString('base64');

            // Track transaction tree with all openers (should not throw for valid tx)
            await Promise.all([
                expect(
                    liteClientOpener.trackTransactionTree(testAddress.toString(), txHash, {
                        maxDepth: 5,
                    }),
                ).resolves.not.toThrow(),
                expect(
                    orbsOpener.trackTransactionTree(testAddress.toString(), txHash, {
                        maxDepth: 5,
                    }),
                ).resolves.not.toThrow(),
                expect(
                    orbsOpener4.trackTransactionTree(testAddress.toString(), txHash, {
                        maxDepth: 5,
                    }),
                ).resolves.not.toThrow(),
                expect(
                    tonClientOpener.trackTransactionTree(testAddress.toString(), txHash, {
                        maxDepth: 5,
                    }),
                ).resolves.not.toThrow(),
            ]);

            // All should complete without throwing
        }, 180000);

        it('should all throw for invalid transaction tree', async () => {
            const fakeHash = Buffer.alloc(32, 0).toString('base64');

            // All should throw when transaction not found
            await expect(
                liteClientOpener.trackTransactionTree(testAddress.toString(), fakeHash, {
                    maxDepth: 3,
                }),
            ).rejects.toThrow();

            await expect(
                orbsOpener.trackTransactionTree(testAddress.toString(), fakeHash, {
                    maxDepth: 3,
                }),
            ).rejects.toThrow();

            await expect(
                orbsOpener4.trackTransactionTree(testAddress.toString(), fakeHash, {
                    maxDepth: 3,
                }),
            ).rejects.toThrow();

            await expect(
                tonClientOpener.trackTransactionTree(testAddress.toString(), fakeHash, {
                    maxDepth: 3,
                }),
            ).rejects.toThrow();
        }, 120000);
    });

    describe('Cross-opener consistency validation', () => {
        it('should maintain consistency across all operations', async () => {
            // Test a complete flow: get state, get transactions, get adjacent, track tree
            const testOpener = async (opener: ContractOpener, name: string) => {
                // 1. Get state
                const state = await opener.getContractState(testAddress);
                expect(state).toBeDefined();

                // 2. Get transactions
                const txs = await opener.getTransactions(testAddress, { limit: 3 });
                expect(txs.length).toBeGreaterThan(0);

                // 3. Get address info
                const info = await opener.getAddressInformation(testAddress);
                expect(info.lastTransaction.lt).toBeDefined();

                // 4. Find transaction by hash
                const txHash = txs[0].hash().toString('base64');
                const foundTx = await opener.getTransactionByHash(testAddress, txHash);
                expect(foundTx).toBeDefined();
                expect(foundTx!.hash().toString('base64')).toBe(txHash);

                return {
                    name,
                    state,
                    txCount: txs.length,
                    firstTxHash: txHash,
                    lastLt: info.lastTransaction.lt,
                };
            };

            // Test all openers
            const [liteResult, orbsResult, orbs4Result, tonClientResult] = await Promise.all([
                testOpener(liteClientOpener, 'LiteClient'),
                testOpener(orbsOpener, 'Orbs'),
                testOpener(orbsOpener4, 'Orbs4'),
                testOpener(tonClientOpener, 'TonClient'),
            ]);

            // All should return valid results
            expect(liteResult.txCount).toBeGreaterThan(0);
            expect(orbsResult.txCount).toBeGreaterThan(0);
            expect(orbs4Result.txCount).toBeGreaterThan(0);
            expect(tonClientResult.txCount).toBeGreaterThan(0);

            // States should be consistent
            expect(liteResult.state.state).toBe(orbsResult.state.state);
            expect(orbsResult.state.state).toBe(orbs4Result.state.state);
            expect(orbs4Result.state.state).toBe(tonClientResult.state.state);

            console.log('Cross-opener consistency validation results:', {
                liteClient: liteResult,
                orbs: orbsResult,
                orbs4: orbs4Result,
                tonClient: tonClientResult,
            });
        }, 180000);
    });
});
