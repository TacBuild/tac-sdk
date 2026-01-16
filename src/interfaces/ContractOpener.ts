import { SandboxContract } from '@ton/sandbox';
import type { Address, Cell, Contract, Dictionary, OpenedContract, Transaction } from '@ton/ton';

import { AddressInformation, GetTransactionsOptions } from '../structs/InternalStruct';
import { ContractState } from '../structs/Struct';

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
    getTransactionByHash(address: Address, hash: string, opts?: GetTransactionsOptions): Promise<Transaction | null>;
    getAdjacentTransactions(address: Address, hash: string, opts?: GetTransactionsOptions): Promise<Transaction[]>;
    getAddressInformation(address: Address): Promise<AddressInformation>;
    getConfig(): Promise<Dictionary<number, Cell>>;
}
