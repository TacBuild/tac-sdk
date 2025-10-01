import type { SendResult, ShardTransaction } from '../structs/InternalStruct';
import { Network } from '../structs/Struct';
import type { Asset, ContractOpener } from './index';

export interface SenderAbstraction {
    /**
     * Sends a single shard transaction on the specified chain.
     * @param shardTransaction Prepared transaction payload to send.
     * @param chain Optional network selector; defaults to current SDK network.
     * @param contractOpener Optional contract opener to use for sending.
     * @returns Promise with low-level send result.
     */
    sendShardTransaction(
        shardTransaction: ShardTransaction,
        chain?: Network,
        contractOpener?: ContractOpener,
    ): Promise<SendResult>;

    /**
     * Sends multiple shard transactions as a batch.
     * @param shardTransactions Array of prepared shard transactions to send.
     * @param chain Optional network selector; defaults to current SDK network.
     * @param contractOpener Optional contract opener to use for sending.
     * @returns Promise with an array of low-level send results in the same order.
     */
    sendShardTransactions(
        shardTransactions: ShardTransaction[],
        chain?: Network,
        contractOpener?: ContractOpener,
    ): Promise<SendResult[]>;

    /**
     * Returns the TVM address of the underlying sender wallet.
     */
    getSenderAddress(): string;

    /**
     * Returns the TON balance of the sender wallet using the provided opener.
     * @param contractOpener Contract opener used for on-chain queries.
     */
    getBalance(contractOpener: ContractOpener): Promise<bigint>;

    /**
     * Returns the balance of a given asset for the sender wallet.
     * @param asset Asset wrapper instance to query balance for.
     */
    getBalanceOf(asset: Asset): Promise<bigint>;
}
