import { SandboxContract } from '@ton/sandbox';
import { Address, beginCell, Contract, ExternalAddress, OpenedContract, storeMessage, Transaction } from '@ton/ton';

import { txFinalizationError } from '../errors';
import { ContractOpener, ILogger } from '../interfaces';
import {
    DEFAULT_FIND_TX_ARCHIVAL,
    DEFAULT_FIND_TX_LIMIT,
    DEFAULT_FIND_TX_MAX_DEPTH,
    IGNORE_MSG_VALUE_1_NANO,
    IGNORE_OPCODE,
} from '../sdk/Consts';
import { getNormalizedExtMessageHash, normalizeHashToBase64 } from '../sdk/Utils';
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
        let currentLt: string | undefined = opts?.lt;
        let currentHash: string | undefined = opts?.hash;

        while (true) {
            const batch = await this.getTransactions(addr, {
                limit,
                lt: currentLt,
                hash: currentHash,
                archival: opts?.archival ?? DEFAULT_FIND_TX_ARCHIVAL,
            });

            if (batch.length === 0) break;

            for (const tx of batch) {
                if (predicate(tx)) {
                    return tx;
                }
            }

            const oldestTx = batch[batch.length - 1];
            if (oldestTx.prevTransactionLt === 0n) break;

            currentLt = oldestTx.prevTransactionLt.toString();
            const hashHex = oldestTx.prevTransactionHash.toString(16).padStart(64, '0');
            currentHash = Buffer.from(hashHex, 'hex').toString('base64');
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
            }

            // 3. check incoming message(internal)
            if (tx.inMessage && tx.inMessage.info.type === 'internal') {
                const messageCell = beginCell().store(storeMessage(tx.inMessage)).endCell();
                const msgHash = messageCell.hash();
                if (msgHash.toString('base64') === targetHashB64) {
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
        if (tx.description.type !== 'generic' || !tx.inMessage) return null;

        // Skip validation for 1 nano messages
        if (tx.inMessage.info.type === 'internal' && tx.inMessage.info.value.coins === IGNORE_MSG_VALUE_1_NANO) {
            return null;
        }

        const bodySlice = tx.inMessage.body.beginParse();
        if (bodySlice.remainingBits < 32) return null;

        const opcode = bodySlice.loadUint(32);
        if (ignoreOpcodeList.includes(opcode)) {
            this.logger?.debug(`Skipping validation for tx: ${tx.hash().toString('base64')} (opcode in ignore list)`);
            return null;
        }

        const { aborted, computePhase, actionPhase } = tx.description;
        const txHash = tx.hash().toString('base64');
        const exitCode = computePhase && computePhase.type !== 'skipped' ? computePhase.exitCode : ('N/A' as const);
        const resultCode = actionPhase ? actionPhase.resultCode : ('N/A' as const);

        if (aborted) {
            if (!computePhase || computePhase.type === 'skipped') {
                return { txHash, exitCode, resultCode, reason: 'compute_phase_missing' };
            }
            if (!computePhase.success || computePhase.exitCode !== 0) {
                return { txHash, exitCode, resultCode, reason: 'compute_phase_failed' };
            }
            if (actionPhase && (!actionPhase.success || actionPhase.resultCode !== 0)) {
                return { txHash, exitCode, resultCode, reason: 'action_phase_failed' };
            }

            return { txHash, exitCode, resultCode, reason: 'aborted' };
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
        limit: number,
    ): Promise<Transaction | null> {
        const opts = { limit, archival: true };

        if (hashType === 'in') {
            return this.getTransactionByInMsgHash(address, hash, opts);
        } else if (hashType === 'out') {
            return this.getTransactionByOutMsgHash(address, hash, opts);
        } else {
            return this.getTransactionByHash(address, hash, opts);
        }
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
        },
    ): Promise<void> {
        const result = await this.trackTransactionTreeWithResult(address, hash, params);
        if (!result.success && result.error) {
            const { txHash, exitCode, resultCode, reason } = result.error;
            throw txFinalizationError(
                `${txHash}: reason= ${reason} (exitCode=${exitCode}, resultCode=${resultCode})`,
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
        },
    ): Promise<TrackTransactionTreeResult> {
        const {
            maxDepth = DEFAULT_FIND_TX_MAX_DEPTH,
            ignoreOpcodeList = IGNORE_OPCODE,
            limit = DEFAULT_FIND_TX_LIMIT,
            direction = 'both',
        } = params;
        const parsedAddress = Address.parse(address);
        const visitedHashes = new Set<string>();
        const queue: TransactionDepth[] = [{ address: parsedAddress, hash, depth: 0, hashType: 'unknown' }];

        while (queue.length > 0) {
            const { hash: currentHash, depth: currentDepth, address: currentAddress, hashType } = queue.shift()!;

            if (visitedHashes.has(currentHash)) continue;
            visitedHashes.add(currentHash);

            this.logger?.debug(`Checking hash (depth ${currentDepth}): ${currentHash}`);

            const tx = await this.findTransactionByHashType(currentAddress!, currentHash, hashType, limit);

            if (!tx) {
                this.logger?.debug(`Transaction not found for hash: ${currentHash}`);
                continue;
            }

            // Validate transaction and return error if found
            const validationError = this.validateTransactionWithResult(tx, ignoreOpcodeList);
            if (validationError) {
                return { success: false, error: validationError };
            }

            // Add adjacent transactions to queue
            if (currentDepth + 1 < maxDepth) {
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

            this.logger?.debug(`Finished checking hash (depth ${currentDepth}): ${currentHash}`);
        }

        return { success: true };
    }
}
