import { SandboxContract } from '@ton/sandbox';
import type { Address, Contract, OpenedContract, Transaction } from '@ton/ton';

import {
    AddressInformation,
    ContractState,
    GetTransactionsOptions,
    TrackTransactionTreeParams,
    TrackTransactionTreeResult,
} from '../structs/Struct';

export interface ContractOpener {
    /**
     * Opens a contract for interaction using the underlying client (lite client, sandbox, etc.).
     * @param src Contract source instance to open.
     * @returns Opened contract ready for method calls and sending messages.
     */
    open<T extends Contract>(src: T): OpenedContract<T> | SandboxContract<T>;

    /**
     * Fetches on-chain contract state for a given address.
     * @param address TVM address of the contract.
     * @returns Promise with the contract state (code/data/existence).
     */
    getContractState(address: Address): Promise<ContractState>;

    /**
     * Closes any underlying connections if supported by the implementation.
     */
    closeConnections?: () => unknown;

    /**
     * Fetches transactions for a given address.
     * @param address Address to fetch transactions for.
     * @param opts Options for fetching transactions (limit, archival, etc.).
     * @returns Promise with array of transactions.
     */
    getTransactions(address: Address, opts: GetTransactionsOptions): Promise<Transaction[]>;

    /**
     * Find transaction by its hash.
     * Searches by transaction hash, and also by incoming message hash (both external-in and internal).
     * This is a universal method that checks all possible hash types.
     * @param address Account address where to search
     * @param hash Transaction or message hash in any format (base64, hex)
     * @param opts Search options (limit, pagination, etc.)
     * @returns Transaction if found, null otherwise
     */
    getTransactionByHash(address: Address, hash: string, opts?: GetTransactionsOptions): Promise<Transaction | null>;

    /**
     * Find transaction by its transaction hash only.
     * More efficient than getTransactionByHash if you know it's a transaction hash.
     * @param address Account address where to search
     * @param txHash Transaction hash in any format (base64, hex)
     * @param opts Search options
     * @returns Transaction if found, null otherwise
     */
    getTransactionByTxHash(address: Address, txHash: string, opts?: GetTransactionsOptions): Promise<Transaction | null>;

    /**
     * Find transaction by its incoming message hash.
     * Useful for finding the transaction that processed a specific message.
     * @param address Account address where to search
     * @param msgHash Message hash in any format (base64, hex)
     * @param opts Search options
     * @returns Transaction if found, null otherwise
     */
    getTransactionByInMsgHash(
        address: Address,
        msgHash: string,
        opts?: GetTransactionsOptions,
    ): Promise<Transaction | null>;

    /**
     * Find transaction by its outgoing message hash.
     * Useful for finding the parent transaction that sent a specific message.
     * @param address Account address where to search
     * @param msgHash Outgoing message hash in any format (base64, hex)
     * @param opts Search options
     * @returns Transaction if found, null otherwise
     */
    getTransactionByOutMsgHash(
        address: Address,
        msgHash: string,
        opts?: GetTransactionsOptions,
    ): Promise<Transaction | null>;

    /**
     * Get adjacent transactions (children via outgoing messages and parent via incoming message).
     * @param address Account address
     * @param hash Transaction or message hash in any format (base64, hex)
     * @param opts Search options
     * @returns Array of adjacent transactions
     */
    getAdjacentTransactions(address: Address, hash: string, opts?: GetTransactionsOptions): Promise<Transaction[]>;

    getAddressInformation(address: Address): Promise<AddressInformation>;
    getConfig(): Promise<string>;

    /**
     * Track and validate entire transaction tree starting from a root transaction.
     * Recursively follows outgoing messages and validates all child transactions.
     * @param address Root account address
     * @param hash Root transaction or message hash
     * @param params Tracking parameters (maxDepth, ignoreOpcodeList, etc.)
     * @throws Error if any transaction in the tree failed
     */
    trackTransactionTree(address: string, hash: string, params?: TrackTransactionTreeParams): Promise<void>;

    /**
     * Track and validate entire transaction tree starting from a root transaction (returns result instead of throwing).
     * Recursively follows outgoing messages and validates all child transactions.
     * @param address Root account address
     * @param hash Root transaction or message hash
     * @param params Tracking parameters (maxDepth, ignoreOpcodeList, etc.)
     * @returns Result object with success flag and error details if validation failed
     */
    trackTransactionTreeWithResult(
        address: string,
        hash: string,
        params?: TrackTransactionTreeParams,
    ): Promise<TrackTransactionTreeResult>;
}
