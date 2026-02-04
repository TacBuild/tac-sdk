import { SandboxContract } from '@ton/sandbox';
import type { Address, Contract, OpenedContract, Transaction } from '@ton/ton';

import { AddressInformation, GetTransactionsOptions } from '../structs/InternalStruct';
import { ContractState, TrackTransactionTreeParams } from '../structs/Struct';

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

    getTransactionByHash(address: Address, hash: string, opts?: GetTransactionsOptions): Promise<Transaction | null>;
    getAdjacentTransactions(address: Address, hash: string, opts?: GetTransactionsOptions): Promise<Transaction[]>;
    getAddressInformation(address: Address): Promise<AddressInformation>;
    getConfig(): Promise<string>;
    trackTransactionTree(address: string, hash: string, params?: TrackTransactionTreeParams): Promise<void>;
}
