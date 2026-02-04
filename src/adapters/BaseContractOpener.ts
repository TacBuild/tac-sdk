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
import { getNormalizedExtMessageHash } from '../sdk/Utils';
import { AddressInformation, GetTransactionsOptions, TransactionDepth } from '../structs/InternalStruct';
import { ContractState, TrackTransactionTreeParams } from '../structs/Struct';

/**
 * Base class for ContractOpener implementations with common functionality
 */
export abstract class BaseContractOpener implements ContractOpener {
    protected logger?: ILogger;

    protected constructor(logger?: ILogger) {
        this.logger = logger;
    }

    // Abstract methods that must be implemented by subclasses
    abstract open<T extends Contract>(contract: T): OpenedContract<T> | SandboxContract<T>;
    abstract getContractState(address: Address): Promise<ContractState>;
    abstract getTransactions(address: Address, opts: GetTransactionsOptions): Promise<Transaction[]>;
    abstract getAddressInformation(address: Address): Promise<AddressInformation>;
    abstract getConfig(): Promise<string>;

    // Optional method
    closeConnections?(): void;

    /**
     * Find transaction by hash with pagination through account history
     */
    async getTransactionByHash(
        addr: Address,
        targetHashB64: string,
        opts?: GetTransactionsOptions,
    ): Promise<Transaction | null> {
        const limit = opts?.limit ?? DEFAULT_FIND_TX_LIMIT;

        // Start from the latest transactions or from provided position
        let currentLt: string | undefined = opts?.lt;
        let currentHash: string | undefined = opts?.hash;

        // Scan through transaction history with pagination
        while (true) {
            const batch = await this.getTransactions(addr, {
                limit,
                lt: currentLt,
                hash: currentHash,
                archival: opts?.archival ?? DEFAULT_FIND_TX_ARCHIVAL,
            });

            if (batch.length === 0) {
                // No more transactions to scan
                break;
            }

            for (const tx of batch) {
                // 1. check tx itself
                if (tx.hash().toString('base64') === targetHashB64) {
                    return tx;
                }

                // 2. check incoming message(external-in)
                if (tx.inMessage && tx.inMessage.info.type === 'external-in') {
                    const msgHash = getNormalizedExtMessageHash(tx.inMessage);
                    if (msgHash === targetHashB64) {
                        return tx;
                    }
                }

                // 3. check incoming message(internal)
                if (tx.inMessage && tx.inMessage.info.type === 'internal') {
                    const messageCell = beginCell().store(storeMessage(tx.inMessage)).endCell();
                    const msgHash = messageCell.hash();
                    if (msgHash.toString('base64') === targetHashB64) {
                        return tx;
                    }
                }
            }

            // Update pagination params to get older transactions
            const oldestTx = batch[batch.length - 1];
            if (oldestTx.prevTransactionLt === 0n) {
                // Reached the first transaction in account history
                break;
            }

            currentLt = oldestTx.prevTransactionLt.toString();
            // Convert bigint hash to base64 string
            const hashHex = oldestTx.prevTransactionHash.toString(16).padStart(64, '0');
            currentHash = Buffer.from(hashHex, 'hex').toString('base64');
        }

        return null;
    }

    /**
     * Get adjacent transactions (children and parent)
     */
    async getAdjacentTransactions(
        addr: Address,
        hashB64: string,
        opts?: GetTransactionsOptions,
    ): Promise<Transaction[]> {
        // 1. Find the root transaction
        const rootTx = await this.getTransactionByHash(addr, hashB64, opts);
        if (!rootTx) return [];

        const adjacent: Transaction[] = [];

        // 2. Follow every outgoing message
        for (const msg of rootTx.outMessages.values()) {
            const dst = msg.info.dest;
            if (!dst || dst instanceof ExternalAddress) continue;

            const msgHashB64 = beginCell().store(storeMessage(msg)).endCell().hash().toString('base64');
            const tx = await this.getTransactionByHash(dst, msgHashB64, opts);
            if (tx) adjacent.push(tx);
        }

        // 3. Optional: follow the incoming message (if it exists and is internal)
        if (rootTx.inMessage?.info.type === 'internal') {
            const msgHashB64 = beginCell().store(storeMessage(rootTx.inMessage)).endCell().hash().toString('base64');
            const tx = await this.getTransactionByHash(rootTx.inMessage.info.src, msgHashB64, opts);
            if (tx) adjacent.push(tx);
        }

        return adjacent;
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
        },
    ): Promise<void> {
        const {
            maxDepth = DEFAULT_FIND_TX_MAX_DEPTH,
            ignoreOpcodeList = IGNORE_OPCODE,
            limit = DEFAULT_FIND_TX_LIMIT,
        } = params;
        const parsedAddress = Address.parse(address);
        const visitedHashes = new Set<string>();
        const queue: TransactionDepth[] = [{ address: parsedAddress, hash, depth: 0 }];

        while (queue.length > 0) {
            const { hash: currentHash, depth: currentDepth, address: currentAddress } = queue.shift()!;

            if (visitedHashes.has(currentHash)) continue;
            visitedHashes.add(currentHash);

            this.logger?.debug(`Checking hash (depth ${currentDepth}): ${currentHash}`);

            // Get the root transaction first to extract child addresses
            const rootTx = await this.getTransactionByHash(currentAddress!, currentHash, {
                limit: limit,
                archival: true,
            });

            if (!rootTx) {
                this.logger?.debug(`Transaction not found for hash: ${currentHash}`);
                continue;
            }

            // Validate root transaction
            if (rootTx.description.type === 'generic' && rootTx.inMessage) {
                if (
                    rootTx.inMessage.info.type === 'internal' &&
                    rootTx.inMessage.info.value.coins === IGNORE_MSG_VALUE_1_NANO
                ) {
                    // Skip validation but continue tree traversal
                } else {
                    const bodySlice = rootTx.inMessage.body.beginParse();
                    if (bodySlice.remainingBits >= 32) {
                        const opcode = bodySlice.loadUint(32);

                        if (!ignoreOpcodeList.includes(opcode)) {
                            const { aborted, computePhase, actionPhase } = rootTx.description;
                            const txHash = rootTx.hash().toString('base64');
                            const exitCode =
                                computePhase && computePhase.type !== 'skipped' ? computePhase.exitCode : 'N/A';
                            const resultCode = actionPhase ? actionPhase.resultCode : 'N/A';

                            if (aborted) {
                                throw txFinalizationError(
                                    `${txHash}: Transaction was aborted (exitCode=${exitCode}, resultCode=${resultCode})`,
                                );
                            }
                            if (!computePhase || computePhase.type === 'skipped') {
                                throw txFinalizationError(
                                    `${txHash}: computePhase not present or skipped (exitCode=${exitCode}, resultCode=${resultCode})`,
                                );
                            }
                            if (!computePhase.success || computePhase.exitCode !== 0) {
                                throw txFinalizationError(
                                    `${txHash}: computePhase failed (exitCode=${exitCode}, resultCode=${resultCode})`,
                                );
                            }
                            if (actionPhase && (!actionPhase.success || actionPhase.resultCode !== 0)) {
                                throw txFinalizationError(
                                    `${txHash}: actionPhase failed (exitCode=${exitCode}, resultCode=${resultCode})`,
                                );
                            }
                        } else {
                            this.logger?.debug(
                                `Skipping validation for hash (depth ${currentDepth}): ${rootTx.hash().toString('base64')}`,
                            );
                        }
                    }
                }
            }

            // Add child transactions to queue
            if (currentDepth + 1 < maxDepth && rootTx.outMessages.size > 0) {
                for (const msg of rootTx.outMessages.values()) {
                    const dst = msg.info.dest;
                    if (!dst || dst instanceof ExternalAddress) continue;

                    const msgHashB64 = beginCell().store(storeMessage(msg)).endCell().hash().toString('base64');

                    queue.push({
                        hash: msgHashB64,
                        address: dst,
                        depth: currentDepth + 1,
                    });
                }
            }

            this.logger?.debug(`Finished checking hash (depth ${currentDepth}): ${currentHash}`);
        }
    }
}
