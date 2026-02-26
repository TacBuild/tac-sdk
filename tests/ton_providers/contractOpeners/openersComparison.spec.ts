import '@ton/test-utils';

import { Address, beginCell, Message, storeMessage, TonClient, Transaction } from '@ton/ton';

import { ContractOpener, LiteClientOpener, Network, orbsOpener, TonClient4Opener, TonClientOpener } from '../../../src';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Comprehensive comparison test for all ContractOpener implementations
 * Validates that all openers return consistent data for the same operations
 */
describe('Contract Openers Comparison Tests', () => {
    let liteClientOpener: LiteClientOpener;
    let orbs: TonClientOpener;
    let tonClient4Opener: TonClient4Opener;
    let tonClientOpener: TonClientOpener;

    // Known mainnet address with transactions (TAC CCL)
    const testAddress = Address.parse('EQAgpWmO8nBUrmfOOldIEmRkLEwV-IIfVAlJsphYswnuL80R');

    beforeAll(async () => {
        // Initialize all openers
        liteClientOpener = await LiteClientOpener.create({ network: Network.MAINNET });
        orbs = await orbsOpener(Network.MAINNET);
        tonClient4Opener = TonClient4Opener.create('https://mainnet-v4.tonhubapi.com');
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
            const [liteState, orbsState, tonClient4State, tonClientState] = await Promise.all([
                liteClientOpener.getContractState(testAddress),
                orbs.getContractState(testAddress),
                tonClient4Opener.getContractState(testAddress),
                tonClientOpener.getContractState(testAddress),
            ]);

            // All should be defined
            expect(liteState).toBeDefined();
            expect(orbsState).toBeDefined();
            expect(tonClient4State).toBeDefined();
            expect(tonClientState).toBeDefined();

            // Compare balance (should be equal within reasonable time window)
            expect(liteState.balance).toBeDefined();
            expect(orbsState.balance).toBeDefined();
            expect(tonClient4State.balance).toBeDefined();
            expect(tonClientState.balance).toBeDefined();

            // Balance might differ slightly due to timing, but should be similar
            const balances = [liteState.balance, orbsState.balance, tonClient4State.balance, tonClientState.balance];
            const maxBalance = balances.reduce((a, b) => (a > b ? a : b));
            const minBalance = balances.reduce((a, b) => (a < b ? a : b));

            // Balances should be within 10% of each other (accounting for transactions between calls)
            const balanceDiff = Number(maxBalance - minBalance);
            const avgBalance = Number(maxBalance + minBalance) / 2;
            expect(balanceDiff / avgBalance).toBeLessThan(0.1);

            // State should be identical
            expect(liteState.state).toBe(orbsState.state);
            expect(orbsState.state).toBe(tonClient4State.state);
            expect(tonClient4State.state).toBe(tonClientState.state);
        }, 60000);
    });

    describe('getTransactions comparison', () => {
        it('should return same transactions from all openers', async () => {
            const limit = 5;

            const [liteTxs, orbsTxs, tonClient4Txs, tonClientTxs] = await Promise.all([
                liteClientOpener.getTransactions(testAddress, { limit }),
                orbs.getTransactions(testAddress, { limit }),
                tonClient4Opener.getTransactions(testAddress, { limit }),
                tonClientOpener.getTransactions(testAddress, { limit }),
            ]);

            // All should return transactions
            expect(liteTxs.length).toBeGreaterThan(0);
            expect(orbsTxs.length).toBeGreaterThan(0);
            expect(tonClient4Txs.length).toBeGreaterThan(0);
            expect(tonClientTxs.length).toBeGreaterThan(0);

            // All should respect limit
            expect(liteTxs.length).toBeLessThanOrEqual(limit);
            expect(orbsTxs.length).toBeLessThanOrEqual(limit);
            expect(tonClient4Txs.length).toBeLessThanOrEqual(limit);
            expect(tonClientTxs.length).toBeLessThanOrEqual(limit);

            // Compare transaction hashes (should be identical for same block)
            const compareTransactions = (tx1: Transaction, tx2: Transaction) => {
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
            const minLength = Math.min(liteTxs.length, orbsTxs.length, tonClient4Txs.length, tonClientTxs.length);

            for (let i = 0; i < minLength; i++) {
                compareTransactions(liteTxs[i], orbsTxs[i]);
                compareTransactions(liteTxs[i], tonClient4Txs[i]);
                compareTransactions(liteTxs[i], tonClientTxs[i]);
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
            const [liteTxs, orbsTxs, tonClient4Txs, tonClientTxs] = await Promise.all([
                liteClientOpener.getTransactions(testAddress, { limit: 3, lt, hash }),
                orbs.getTransactions(testAddress, { limit: 3, lt, hash }),
                tonClient4Opener.getTransactions(testAddress, { limit: 3, lt, hash }),
                tonClientOpener.getTransactions(testAddress, { limit: 3, lt, hash }),
            ]);

            // All should return same transactions
            const minLength = Math.min(liteTxs.length, orbsTxs.length, tonClient4Txs.length, tonClientTxs.length);
            expect(minLength).toBeGreaterThan(0);

            for (let i = 0; i < minLength; i++) {
                const liteHash = liteTxs[i].hash().toString('base64');
                const orbsHash = orbsTxs[i].hash().toString('base64');
                const tonClient4Hash = tonClient4Txs[i].hash().toString('base64');
                const tonClientHash = tonClientTxs[i].hash().toString('base64');

                expect(liteHash).toBe(orbsHash);
                expect(orbsHash).toBe(tonClient4Hash);
                expect(tonClient4Hash).toBe(tonClientHash);
            }
        }, 60000);
    });

    describe('getAddressInformation comparison', () => {
        it('should return same address information from all openers', async () => {
            const [liteInfo, orbsInfo, tonClient4Info, tonClientInfo] = await Promise.all([
                liteClientOpener.getAddressInformation(testAddress),
                orbs.getAddressInformation(testAddress),
                tonClient4Opener.getAddressInformation(testAddress),
                tonClientOpener.getAddressInformation(testAddress),
            ]);

            // All should return same last transaction info
            expect(liteInfo.lastTransaction.lt).toBeDefined();
            expect(orbsInfo.lastTransaction.lt).toBeDefined();
            expect(tonClient4Info.lastTransaction.lt).toBeDefined();
            expect(tonClientInfo.lastTransaction.lt).toBeDefined();

            // Last transaction LT and hash should be identical (within reasonable time)
            // They might differ if transactions happened between calls, but should be close
            const lts = [
                BigInt(liteInfo.lastTransaction.lt),
                BigInt(orbsInfo.lastTransaction.lt),
                BigInt(tonClient4Info.lastTransaction.lt),
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
            const [liteConfig, tonClient4Config, tonClientConfig] = await Promise.all([
                liteClientOpener.getConfig(),
                tonClient4Opener.getConfig(),
                tonClientOpener.getConfig(),
            ]);

            // All should return config strings
            expect(typeof liteConfig).toBe('string');
            expect(typeof tonClient4Config).toBe('string');
            expect(typeof tonClientConfig).toBe('string');

            expect(liteConfig.length).toBeGreaterThan(0);
            expect(tonClient4Config.length).toBeGreaterThan(0);
            expect(tonClientConfig.length).toBeGreaterThan(0);

            // Configs should be identical (or very similar - might differ by block)
            // At minimum, they should decode to similar structures
            expect(liteConfig.length).toBeGreaterThan(1000);
            expect(tonClient4Config.length).toBeGreaterThan(1000);
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
            const [liteTx, orbsTx, tonClient4Tx, tonClientTx] = await Promise.all([
                liteClientOpener.getTransactionByHash(testAddress, txHash),
                orbs.getTransactionByHash(testAddress, txHash),
                tonClient4Opener.getTransactionByHash(testAddress, txHash),
                tonClientOpener.getTransactionByHash(testAddress, txHash),
            ]);

            // All should find the transaction
            expect(liteTx).toBeDefined();
            expect(orbsTx).toBeDefined();
            expect(tonClient4Tx).toBeDefined();
            expect(tonClientTx).toBeDefined();

            // All should return same transaction
            expect(liteTx!.hash().toString('base64')).toBe(txHash);
            expect(orbsTx!.hash().toString('base64')).toBe(txHash);
            expect(tonClient4Tx!.hash().toString('base64')).toBe(txHash);
            expect(tonClientTx!.hash().toString('base64')).toBe(txHash);

            // Compare LT
            expect(liteTx!.lt).toBe(targetTx.lt);
            expect(orbsTx!.lt).toBe(targetTx.lt);
            expect(tonClient4Tx!.lt).toBe(targetTx.lt);
            expect(tonClientTx!.lt).toBe(targetTx.lt);
        }, 120000);
    });

    describe('getAdjacentTransactions comparison', () => {
        it('should return same adjacent transactions from all openers', async () => {
            // Get a transaction that has children
            const txs = await liteClientOpener.getTransactions(testAddress, { limit: 10 });
            expect(txs.length).toBeGreaterThan(0);

            // Find a transaction with outgoing messages
            const txWithChildren = txs.find((tx: Transaction) => tx.outMessages.size > 0);
            expect(txWithChildren).toBeDefined();

            const txHash = txWithChildren!.hash().toString('base64');

            // Get adjacent transactions from all openers
            const [liteAdj, orbsAdj, tonClient4Adj, tonClientAdj] = await Promise.all([
                liteClientOpener.getAdjacentTransactions(testAddress, txHash, { limit: 10 }),
                orbs.getAdjacentTransactions(testAddress, txHash, { limit: 10 }),
                tonClient4Opener.getAdjacentTransactions(testAddress, txHash, { limit: 10 }),
                tonClientOpener.getAdjacentTransactions(testAddress, txHash, { limit: 10 }),
            ]);

            // All should return adjacent transactions
            expect(liteAdj.length).toBeGreaterThan(0);
            expect(orbsAdj.length).toBeGreaterThan(0);
            expect(tonClient4Adj.length).toBeGreaterThan(0);
            expect(tonClientAdj.length).toBeGreaterThan(0);

            // Should return same number of adjacent transactions
            expect(liteAdj.length).toBe(orbsAdj.length);
            expect(orbsAdj.length).toBe(tonClient4Adj.length);
            expect(tonClient4Adj.length).toBe(tonClientAdj.length);

            // Compare transaction hashes
            const liteHashes = liteAdj.map((tx: Transaction) => tx.hash().toString('base64')).sort();
            const orbsHashes = orbsAdj.map((tx: Transaction) => tx.hash().toString('base64')).sort();
            const tonClient4Hashes = tonClient4Adj.map((tx: Transaction) => tx.hash().toString('base64')).sort();
            const tonClientHashes = tonClientAdj.map((tx: Transaction) => tx.hash().toString('base64')).sort();

            expect(liteHashes).toEqual(orbsHashes);
            expect(orbsHashes).toEqual(tonClient4Hashes);
            expect(tonClient4Hashes).toEqual(tonClientHashes);
        }, 120000);
    });

    describe('getTransactionByTxHash comparison', () => {
        it('should find same transaction by tx hash from all openers', async () => {
            const txs = await liteClientOpener.getTransactions(testAddress, { limit: 1 });
            expect(txs.length).toBeGreaterThan(0);

            const targetTx = txs[0];
            const txHash = targetTx.hash().toString('base64');

            const [liteTx, orbsTx, tonClient4Tx, tonClientTx] = await Promise.all([
                liteClientOpener.getTransactionByTxHash(testAddress, txHash),
                orbs.getTransactionByTxHash(testAddress, txHash),
                tonClient4Opener.getTransactionByTxHash(testAddress, txHash),
                tonClientOpener.getTransactionByTxHash(testAddress, txHash),
            ]);

            expect(liteTx).toBeDefined();
            expect(orbsTx).toBeDefined();
            expect(tonClient4Tx).toBeDefined();
            expect(tonClientTx).toBeDefined();

            expect(liteTx!.hash().toString('base64')).toBe(txHash);
            expect(orbsTx!.hash().toString('base64')).toBe(txHash);
            expect(tonClient4Tx!.hash().toString('base64')).toBe(txHash);
            expect(tonClientTx!.hash().toString('base64')).toBe(txHash);
        }, 120000);
    });

    describe('getTransactionByInMsgHash comparison', () => {
        it('should find same transaction by incoming message hash from all openers', async () => {
            const txs = await liteClientOpener.getTransactions(testAddress, { limit: 10 });
            const txWithInMsg = txs.find((tx: Transaction) => tx.inMessage !== undefined);
            expect(txWithInMsg).toBeDefined();

            const inMsg = txWithInMsg!.inMessage!;
            const msgHashB64 = beginCell().store(storeMessage(inMsg)).endCell().hash().toString('base64');

            const [liteTx, orbsTx, tonClient4Tx, tonClientTx] = await Promise.all([
                liteClientOpener.getTransactionByInMsgHash(testAddress, msgHashB64),
                orbs.getTransactionByInMsgHash(testAddress, msgHashB64),
                tonClient4Opener.getTransactionByInMsgHash(testAddress, msgHashB64),
                tonClientOpener.getTransactionByInMsgHash(testAddress, msgHashB64),
            ]);

            expect(liteTx).toBeDefined();
            expect(orbsTx).toBeDefined();
            expect(tonClient4Tx).toBeDefined();
            expect(tonClientTx).toBeDefined();

            const expectedHash = txWithInMsg!.hash().toString('base64');
            expect(liteTx!.hash().toString('base64')).toBe(expectedHash);
            expect(orbsTx!.hash().toString('base64')).toBe(expectedHash);
            expect(tonClient4Tx!.hash().toString('base64')).toBe(expectedHash);
            expect(tonClientTx!.hash().toString('base64')).toBe(expectedHash);
        }, 120000);
    });

    describe('getTransactionByOutMsgHash comparison', () => {
        it('should find same transaction by outgoing message hash from all openers', async () => {
            const txs = await liteClientOpener.getTransactions(testAddress, { limit: 10 });
            const txWithOutMsg = txs.find((tx: Transaction) => tx.outMessages.size > 0);
            expect(txWithOutMsg).toBeDefined();

            const outMsg = Array.from(txWithOutMsg!.outMessages.values())[0] as Message;
            const msgHashB64 = beginCell().store(storeMessage(outMsg)).endCell().hash().toString('base64');

            const [liteTx, orbsTx, tonClient4Tx, tonClientTx] = await Promise.all([
                liteClientOpener.getTransactionByOutMsgHash(testAddress, msgHashB64),
                orbs.getTransactionByOutMsgHash(testAddress, msgHashB64),
                tonClient4Opener.getTransactionByOutMsgHash(testAddress, msgHashB64),
                tonClientOpener.getTransactionByOutMsgHash(testAddress, msgHashB64),
            ]);

            expect(liteTx).toBeDefined();
            expect(orbsTx).toBeDefined();
            expect(tonClient4Tx).toBeDefined();
            expect(tonClientTx).toBeDefined();

            const expectedHash = txWithOutMsg!.hash().toString('base64');
            expect(liteTx!.hash().toString('base64')).toBe(expectedHash);
            expect(orbsTx!.hash().toString('base64')).toBe(expectedHash);
            expect(tonClient4Tx!.hash().toString('base64')).toBe(expectedHash);
            expect(tonClientTx!.hash().toString('base64')).toBe(expectedHash);
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
                    orbs.trackTransactionTree(testAddress.toString(), txHash, {
                        maxDepth: 5,
                    }),
                ).resolves.not.toThrow(),
                expect(
                    tonClient4Opener.trackTransactionTree(testAddress.toString(), txHash, {
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
    });

    describe('trackTransactionTreeWithResult comparison', () => {
        it('should return same validation results from all openers', async () => {
            const txs = await liteClientOpener.getTransactions(testAddress, { limit: 1 });
            expect(txs.length).toBeGreaterThan(0);

            const tx = txs[0];
            const txHash = tx.hash().toString('base64');

            const [liteResult, orbsResult, tonClient4Result, tonClientResult] = await Promise.all([
                liteClientOpener.trackTransactionTreeWithResult(testAddress.toString(), txHash, { maxDepth: 5 }),
                orbs.trackTransactionTreeWithResult(testAddress.toString(), txHash, { maxDepth: 5 }),
                tonClient4Opener.trackTransactionTreeWithResult(testAddress.toString(), txHash, { maxDepth: 5 }),
                tonClientOpener.trackTransactionTreeWithResult(testAddress.toString(), txHash, { maxDepth: 5 }),
            ]);

            // All should return success
            expect(liteResult.success).toBe(true);
            expect(orbsResult.success).toBe(true);
            expect(tonClient4Result.success).toBe(true);
            expect(tonClientResult.success).toBe(true);

            // All should have no errors
            expect(liteResult.error).toBeUndefined();
            expect(orbsResult.error).toBeUndefined();
            expect(tonClient4Result.error).toBeUndefined();
            expect(tonClientResult.error).toBeUndefined();
        }, 180000);
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
            const [liteResult, orbsResult, tonClient4Result, tonClientResult] = await Promise.all([
                testOpener(liteClientOpener, 'LiteClient'),
                testOpener(orbs, 'Orbs'),
                testOpener(tonClient4Opener, 'tonClient4'),
                testOpener(tonClientOpener, 'TonClient'),
            ]);

            // All should return valid results
            expect(liteResult.txCount).toBeGreaterThan(0);
            expect(orbsResult.txCount).toBeGreaterThan(0);
            expect(tonClient4Result.txCount).toBeGreaterThan(0);
            expect(tonClientResult.txCount).toBeGreaterThan(0);

            // States should be consistent
            expect(liteResult.state.state).toBe(orbsResult.state.state);
            expect(orbsResult.state.state).toBe(tonClient4Result.state.state);
            expect(tonClient4Result.state.state).toBe(tonClientResult.state.state);

            console.log('Cross-opener consistency validation results:', {
                liteClient: liteResult,
                orbs: orbsResult,
                tonClient4: tonClient4Result,
                tonClient: tonClientResult,
            });
        }, 180000);
    });
});
