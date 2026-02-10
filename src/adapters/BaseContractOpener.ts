import { SandboxContract } from '@ton/sandbox';
import { Address, beginCell, Contract, ExternalAddress, OpenedContract, storeMessage, Transaction } from '@ton/ton';

import { txFinalizationError } from '../errors';
import { ContractOpener, ILogger } from '../interfaces';
import {
    DEFAULT_FIND_TX_ARCHIVAL,
    DEFAULT_FIND_TX_LIMIT,
    DEFAULT_FIND_TX_MAX_DEPTH,
    DEFAULT_MAX_SCANNED_TRANSACTIONS,
    DEFAULT_WAIT_FOR_ROOT_TRANSACTION,
    DEFAULT_WAIT_FOR_ROOT_TRANSACTION_RETRY_DELAY_MS,
    DEFAULT_WAIT_FOR_ROOT_TRANSACTION_TIMEOUT_MS,
    IGNORE_MSG_VALUE_1_NANO,
    IGNORE_OPCODE,
} from '../sdk/Consts';
import { getNormalizedExtMessageHash, normalizeHashToBase64, sleep } from '../sdk/Utils';
import { TransactionDepth } from '../structs/InternalStruct';
import { AddressInformation, GetTransactionsOptions } from '../structs/Struct';
import {
    ContractState,
    TrackTransactionTreeParams,
    TrackTransactionTreeResult,
    TransactionValidationError,
} from '../structs/Struct';

/**
 * Base class for ContractOpener implementations with common functionality
 */
export abstract class BaseContractOpener implements ContractOpener {
    protected logger?: ILogger;

    protected constructor(logger?: ILogger) {
        this.logger = logger;
    }

    abstract open<T extends Contract>(contract: T): OpenedContract<T> | SandboxContract<T>;
    abstract getContractState(address: Address): Promise<ContractState>;
    abstract getTransactions(address: Address, opts: GetTransactionsOptions): Promise<Transaction[]>;
    abstract getAddressInformation(address: Address): Promise<AddressInformation>;
    abstract getConfig(): Promise<string>;

    closeConnections?(): void;

    /**
     * Common pagination logic for scanning transaction history
     * @param addr Account address
     * @param opts Search options
     * @param predicate Function to check if transaction matches search criteria
     * @returns Found transaction or null
     */
    private async scanTransactionHistory(
        addr: Address,
        opts: GetTransactionsOptions | undefined,
        predicate: (tx: Transaction) => boolean,
    ): Promise<Transaction | null> {
        const limit = opts?.limit ?? DEFAULT_FIND_TX_LIMIT;
        const inclusive = opts?.inclusive ?? true;
        const toLt = opts?.to_lt ? BigInt(opts.to_lt) : undefined;
        let currentLt: string | undefined = opts?.lt;
        let currentHash: string | undefined = opts?.hash ? normalizeHashToBase64(opts.hash) : undefined;
        const seenCursors = new Set<string>();
        let scannedTransactions = 0;
        const maxScannedTransactions = opts?.maxScannedTransactions ?? DEFAULT_MAX_SCANNED_TRANSACTIONS;
        const prevHashToBase64 = (hash: bigint): string => {
            const hex = hash.toString(16).padStart(64, '0');
            return Buffer.from(hex, 'hex').toString('base64');
        };

        while (true) {
            const batch = await this.getTransactions(addr, {
                limit,
                lt: currentLt,
                hash: currentHash,
                to_lt: opts?.to_lt,
                inclusive,
                archival: opts?.archival ?? DEFAULT_FIND_TX_ARCHIVAL,
            });

            if (batch.length === 0) break;

            if (currentLt && currentHash) {
                const first = batch[0];
                const firstHash = first.hash().toString('base64');
                if (first.lt.toString() === currentLt && firstHash === currentHash) {
                    batch.shift();
                    if (batch.length === 0) {
                        if (first.prevTransactionLt === 0n) break;
                        currentLt = first.prevTransactionLt.toString();
                        currentHash = prevHashToBase64(first.prevTransactionHash);
                        const cursorKey = `${currentLt}:${currentHash}`;
                        if (seenCursors.has(cursorKey)) break;
                        seenCursors.add(cursorKey);
                        continue;
                    }
                }
            }

            for (const tx of batch) {
                scannedTransactions += 1;
                if (scannedTransactions > maxScannedTransactions) {
                    this.logger?.debug(
                        `Scan limit reached (${maxScannedTransactions} transactions), stopping history scan`,
                    );
                    return null;
                }
                if (predicate(tx)) {
                    return tx;
                }
            }

            const oldestTx = batch[batch.length - 1];
            if (oldestTx.prevTransactionLt === 0n) break;
            if (toLt !== undefined) {
                if (inclusive ? oldestTx.lt <= toLt : oldestTx.lt < toLt) break;
            }

            const nextLt = oldestTx.lt.toString();
            const nextHash = oldestTx.hash().toString('base64');
            if (currentLt && BigInt(nextLt) >= BigInt(currentLt)) break;
            const cursorKey = `${nextLt}:${nextHash}`;
            if (seenCursors.has(cursorKey)) break;
            seenCursors.add(cursorKey);
            currentLt = nextLt;
            currentHash = nextHash;
        }

        return null;
    }

    /**
     * Find transaction by hash with pagination through account history
     * @param addr Account address
     * @param hash Transaction hash in any format (base64, hex)
     * @param opts Search options
     */
    async getTransactionByHash(
        addr: Address,
        hash: string,
        opts?: GetTransactionsOptions,
    ): Promise<Transaction | null> {
        const targetHashB64 = normalizeHashToBase64(hash);

        return this.scanTransactionHistory(addr, opts, (tx) => {
            // 1. check tx itself
            if (tx.hash().toString('base64') === targetHashB64) {
                return true;
            }

            // 2. check incoming message(external-in)
            if (tx.inMessage && tx.inMessage.info.type === 'external-in') {
                const msgHash = getNormalizedExtMessageHash(tx.inMessage);
                if (msgHash === targetHashB64) {
                    return true;
                }
                const rawMsgHash = beginCell().store(storeMessage(tx.inMessage)).endCell().hash().toString('base64');
                if (rawMsgHash === targetHashB64) {
                    return true;
                }
            }

            // 3. check incoming message(internal)
            if (tx.inMessage && tx.inMessage.info.type === 'internal') {
                const messageCell = beginCell().store(storeMessage(tx.inMessage)).endCell();
                const msgHash = messageCell.hash();
                if (msgHash.toString('base64') === targetHashB64) {
                    return true;
                }
            }

            // 4. check outcoming message
            for (const outMsg of tx.outMessages.values()) {
                const messageCell = beginCell().store(storeMessage(outMsg)).endCell();
                const hash = messageCell.hash();
                if (hash.toString('base64') === targetHashB64) {
                    return true;
                }
            }

            return false;
        });
    }

    /**
     * Find transaction by its transaction hash only.
     * More efficient than getTransactionByHash when you know it's a transaction hash.
     */
    async getTransactionByTxHash(
        addr: Address,
        txHash: string,
        opts?: GetTransactionsOptions,
    ): Promise<Transaction | null> {
        const targetHashB64 = normalizeHashToBase64(txHash);

        return this.scanTransactionHistory(addr, opts, (tx) => {
            return tx.hash().toString('base64') === targetHashB64;
        });
    }

    /**
     * Find transaction by its incoming message hash.
     * Useful for finding the transaction that processed a specific message.
     */
    async getTransactionByInMsgHash(
        addr: Address,
        msgHash: string,
        opts?: GetTransactionsOptions,
    ): Promise<Transaction | null> {
        const targetHashB64 = normalizeHashToBase64(msgHash);

        return this.scanTransactionHistory(addr, opts, (tx) => {
            // Check incoming message(external-in) - uses normalized hash
            if (tx.inMessage && tx.inMessage.info.type === 'external-in') {
                const hash = getNormalizedExtMessageHash(tx.inMessage);
                if (hash === targetHashB64) {
                    return true;
                }
                const rawHash = beginCell().store(storeMessage(tx.inMessage)).endCell().hash().toString('base64');
                if (rawHash === targetHashB64) {
                    return true;
                }
            }

            // Check incoming message(internal) - uses full message cell hash
            if (tx.inMessage && tx.inMessage.info.type === 'internal') {
                const messageCell = beginCell().store(storeMessage(tx.inMessage)).endCell();
                const hash = messageCell.hash();
                if (hash.toString('base64') === targetHashB64) {
                    return true;
                }
            }

            return false;
        });
    }

    /**
     * Find transaction by its outgoing message hash.
     * Useful for finding the parent transaction that sent a specific message.
     */
    async getTransactionByOutMsgHash(
        addr: Address,
        msgHash: string,
        opts?: GetTransactionsOptions,
    ): Promise<Transaction | null> {
        const targetHashB64 = normalizeHashToBase64(msgHash);

        return this.scanTransactionHistory(addr, opts, (tx) => {
            for (const outMsg of tx.outMessages.values()) {
                const messageCell = beginCell().store(storeMessage(outMsg)).endCell();
                const hash = messageCell.hash();
                if (hash.toString('base64') === targetHashB64) {
                    return true;
                }
            }
            return false;
        });
    }

    /**
     * Get adjacent transactions (children and parent)
     * @param addr Account address
     * @param hash Transaction hash in any format (base64, hex)
     * @param opts Search options
     */
    async getAdjacentTransactions(
        addr: Address,
        hash: string,
        opts?: GetTransactionsOptions,
    ): Promise<Transaction[]> {
        // 1. Find the root transaction (hash will be normalized inside getTransactionByHash)
        const rootTx = await this.getTransactionByHash(addr, hash, opts);
        if (!rootTx) return [];

        const adjacent: Transaction[] = [];

        // 2. Follow every outgoing message to find child transactions
        for (const msg of rootTx.outMessages.values()) {
            const dst = msg.info.dest;
            if (!dst || dst instanceof ExternalAddress) continue;

            const msgHashB64 = beginCell().store(storeMessage(msg)).endCell().hash().toString('base64');
            // The outgoing message becomes an incoming message at the destination
            const tx = await this.getTransactionByInMsgHash(dst, msgHashB64, opts);
            if (tx) adjacent.push(tx);
        }

        // 3. Optional: follow the incoming message to find parent transaction
        if (rootTx.inMessage?.info.type === 'internal') {
            const msgHashB64 = beginCell().store(storeMessage(rootTx.inMessage)).endCell().hash().toString('base64');
            // The incoming message was an outgoing message at the source
            const tx = await this.getTransactionByOutMsgHash(rootTx.inMessage.info.src, msgHashB64, opts);
            if (tx) adjacent.push(tx);
        }

        return adjacent;
    }

    /**
     * Validate transaction phases and return error details
     */
    private validateTransactionWithResult(
        tx: Transaction,
        ignoreOpcodeList: number[],
    ): TransactionValidationError | null {
        if (tx.description.type !== 'generic') return null;

        const { aborted, computePhase, actionPhase } = tx.description;
        const txHash = tx.hash().toString('base64');
        const exitCode = computePhase && computePhase.type !== 'skipped' ? computePhase.exitCode : ('N/A' as const);
        const resultCode = actionPhase ? actionPhase.resultCode : ('N/A' as const);

        if (aborted) {
            return { txHash, exitCode, resultCode, reason: 'aborted' };
        }
        if (!computePhase) {
            return { txHash, exitCode, resultCode, reason: 'compute_phase_missing' };
        }
        if (computePhase.type !== 'skipped' && (!computePhase.success || computePhase.exitCode !== 0)) {
            return { txHash, exitCode, resultCode, reason: 'compute_phase_failed' };
        }
        if (actionPhase && (!actionPhase.success || actionPhase.resultCode !== 0)) {
            return { txHash, exitCode, resultCode, reason: 'action_phase_failed' };
        }

        if (!tx.inMessage) return null;

        // Log optional skip hints (does not bypass phase validation)
        if (tx.inMessage.info.type === 'internal' && tx.inMessage.info.value.coins === IGNORE_MSG_VALUE_1_NANO) {
            this.logger?.debug(`Skipping extra checks for tx: ${txHash} (1 nano message)`);
            return null;
        }

        const bodySlice = tx.inMessage.body.beginParse();
        if (bodySlice.remainingBits >= 32) {
            const opcode = bodySlice.loadUint(32);
            if (ignoreOpcodeList.includes(opcode)) {
                this.logger?.debug(`Skipping extra checks for tx: ${txHash} (opcode in ignore list)`);
            }
        }

        return null;
    }

    /**
     * Find transaction by hash type
     */
    private async findTransactionByHashType(
        address: Address,
        hash: string,
        hashType: 'unknown' | 'in' | 'out' | undefined,
        opts: GetTransactionsOptions,
    ): Promise<Transaction | null> {
        const searchOpts: GetTransactionsOptions = { archival: true, ...opts };

        if (hashType === 'in') {
            return this.getTransactionByInMsgHash(address, hash, searchOpts);
        } else if (hashType === 'out') {
            return this.getTransactionByOutMsgHash(address, hash, searchOpts);
        } else {
            return this.getTransactionByHash(address, hash, searchOpts);
        }
    }

    /**
     * Retry lookup for root transaction because it may appear in indexers with a delay.
     */
    private async findRootTransactionWithRetry(
        address: Address,
        hash: string,
        hashType: 'unknown' | 'in' | 'out' | undefined,
        limit: number,
        maxScannedTransactions: number,
        waitForRootTransaction: boolean,
    ): Promise<Transaction | null> {
        if (!waitForRootTransaction) {
            return this.findTransactionByHashType(address, hash, hashType, {
                limit,
                archival: true,
                maxScannedTransactions,
            });
        }

        const attempts = Math.ceil(
            DEFAULT_WAIT_FOR_ROOT_TRANSACTION_TIMEOUT_MS / DEFAULT_WAIT_FOR_ROOT_TRANSACTION_RETRY_DELAY_MS,
        );
        const broadSearchOpts: GetTransactionsOptions = { limit, archival: true, maxScannedTransactions };
        const baselineInfo = await this.getAddressInformation(address);
        let seenLt: string | undefined = baselineInfo.lastTransaction.lt || undefined;

        // Capture baseline before first search.
        const firstTx = await this.findTransactionByHashType(address, hash, hashType, broadSearchOpts);
        if (firstTx) {
            this.logger?.debug(`Root transaction found on attempt 1/${attempts}`);
            return firstTx;
        }
        this.logger?.debug(
            `Root transaction not found yet (attempt 1/${attempts}), retrying in ${DEFAULT_WAIT_FOR_ROOT_TRANSACTION_RETRY_DELAY_MS}ms`,
        );
        await sleep(DEFAULT_WAIT_FOR_ROOT_TRANSACTION_RETRY_DELAY_MS);

        for (let attempt = 2; attempt <= attempts; attempt++) {
            const info = await this.getAddressInformation(address);
            const currentLt = info.lastTransaction.lt || undefined;

            if (!currentLt || currentLt === seenLt) {
                this.logger?.debug(
                    `Root transaction not found yet (attempt ${attempt}/${attempts}), lastTx unchanged, retrying in ${DEFAULT_WAIT_FOR_ROOT_TRANSACTION_RETRY_DELAY_MS}ms`,
                );
                await sleep(DEFAULT_WAIT_FOR_ROOT_TRANSACTION_RETRY_DELAY_MS);
                continue;
            }

            seenLt = currentLt;
            const tx = await this.findTransactionByHashType(address, hash, hashType, broadSearchOpts);
            if (tx) {
                this.logger?.debug(`Root transaction found on attempt ${attempt}/${attempts}`);
                return tx;
            }
            this.logger?.debug(
                `Root transaction not found yet (attempt ${attempt}/${attempts}), retrying in ${DEFAULT_WAIT_FOR_ROOT_TRANSACTION_RETRY_DELAY_MS}ms`,
            );
            await sleep(DEFAULT_WAIT_FOR_ROOT_TRANSACTION_RETRY_DELAY_MS);
        }

        this.logger?.debug(`Root transaction not found after ${attempts} attempts`);
        return null;
    }

    /**
     * Track transaction tree and validate all transactions
     */
    async trackTransactionTree(
        address: string,
        hash: string,
        params: TrackTransactionTreeParams = {
            maxDepth: DEFAULT_FIND_TX_MAX_DEPTH,
            ignoreOpcodeList: IGNORE_OPCODE,
            limit: DEFAULT_FIND_TX_LIMIT,
            direction: 'both',
            waitForRootTransaction: DEFAULT_WAIT_FOR_ROOT_TRANSACTION,
        },
    ): Promise<void> {
        const result = await this.trackTransactionTreeWithResult(address, hash, params);
        if (this.logger && typeof result.checkedCount === 'number') {
            this.logger.debug(`Transaction tree checked: ${result.checkedCount} unique transaction(s)`);
        }
        if (!result.success && result.error) {
            const { txHash, exitCode, resultCode, reason, address: errorAddress, hashType } = result.error;
            const context =
                reason === 'not_found'
                    ? ` address=${errorAddress ?? 'unknown'} hashType=${hashType ?? 'unknown'}`
                    : '';
            throw txFinalizationError(
                `${txHash}: reason=${reason} (exitCode=${exitCode}, resultCode=${resultCode})${context}`,
            );
        }
    }

    /**
     * Track transaction tree and validate all transactions (returns result instead of throwing)
     */
    async trackTransactionTreeWithResult(
        address: string,
        hash: string,
        params: TrackTransactionTreeParams = {
            maxDepth: DEFAULT_FIND_TX_MAX_DEPTH,
            ignoreOpcodeList: IGNORE_OPCODE,
            limit: DEFAULT_FIND_TX_LIMIT,
            direction: 'both',
            waitForRootTransaction: DEFAULT_WAIT_FOR_ROOT_TRANSACTION,
        },
    ): Promise<TrackTransactionTreeResult> {
        const {
            maxDepth = DEFAULT_FIND_TX_MAX_DEPTH,
            ignoreOpcodeList = IGNORE_OPCODE,
            limit = DEFAULT_FIND_TX_LIMIT,
            maxScannedTransactions = DEFAULT_MAX_SCANNED_TRANSACTIONS,
            direction = 'both',
            waitForRootTransaction = DEFAULT_WAIT_FOR_ROOT_TRANSACTION,
        } = params;
        const parsedAddress = Address.parse(address);
        const normalizedRootHash = normalizeHashToBase64(hash);
        const visitedSearchKeys = new Set<string>();
        const processedTxHashes = new Set<string>();
        let checkedCount = 0;
        const searchOpts: GetTransactionsOptions = { limit, archival: true, maxScannedTransactions };
        const queue: TransactionDepth[] = [
            { address: parsedAddress, hash: normalizedRootHash, depth: 0, hashType: 'unknown' },
        ];

        while (queue.length > 0) {
            const { hash: currentHash, depth: currentDepth, address: currentAddress, hashType } = queue.shift()!;

            const visitedKey = `${currentAddress!.toString()}:${currentHash}:${hashType}`;
            if (visitedSearchKeys.has(visitedKey)) continue;
            visitedSearchKeys.add(visitedKey);

            const tx =
                currentDepth === 0
                    ? await this.findRootTransactionWithRetry(
                          currentAddress!,
                          currentHash,
                          hashType,
                          limit,
                          maxScannedTransactions,
                          waitForRootTransaction,
                      )
                    : await this.findTransactionByHashType(currentAddress!, currentHash, hashType, searchOpts);

            if (!tx) {
                this.logger?.debug(
                    `Transaction not found for hash: ${currentHash} (address=${currentAddress?.toString()}, hashType=${hashType ?? 'unknown'})`,
                );
                return {
                    success: false,
                    checkedCount,
                    error: {
                        txHash: currentHash,
                        exitCode: 'N/A',
                        resultCode: 'N/A',
                        reason: 'not_found',
                        address: currentAddress?.toString(),
                        hashType: hashType ?? 'unknown',
                    },
                };
            }

            const txHash = tx.hash().toString('base64');
            if (processedTxHashes.has(txHash)) {
                continue;
            }
            processedTxHashes.add(txHash);
            checkedCount += 1;
            this.logger?.debug(`Checking tx (depth ${currentDepth}): ${txHash}`);

            // Validate transaction and return error if found
            const validationError = this.validateTransactionWithResult(tx, ignoreOpcodeList);
            if (validationError) {
                return { success: false, checkedCount, error: validationError };
            }

            // Add adjacent transactions to queue
            if (currentDepth < maxDepth) {
                if ((direction === 'forward' || direction === 'both') && tx.outMessages.size > 0) {
                    for (const msg of tx.outMessages.values()) {
                        const dst = msg.info.dest;
                        if (!dst || dst instanceof ExternalAddress) continue;

                        queue.push({
                            hash: beginCell().store(storeMessage(msg)).endCell().hash().toString('base64'),
                            address: dst,
                            depth: currentDepth + 1,
                            hashType: 'in',
                        });
                    }
                }

                // Backward: add parent (incoming message source)
                if ((direction === 'backward' || direction === 'both') && tx.inMessage?.info.type === 'internal') {
                    queue.push({
                        hash: beginCell().store(storeMessage(tx.inMessage)).endCell().hash().toString('base64'),
                        address: tx.inMessage.info.src,
                        depth: currentDepth + 1,
                        hashType: 'out',
                    });
                }
            }
        }

        return { success: true, checkedCount };
    }
}
