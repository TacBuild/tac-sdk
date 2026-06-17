import { ToncenterV3IndexedTransaction, ToncenterV3TraversalParams } from '../structs/Struct';

/**
 * Contract for indexed TON transaction lookup by hash.
 * Used when the SDK must resolve any TON transaction hash from a linked chain of TON transactions
 * into indexed transaction context and then find the sequencer-collected event transaction on crossChainLayer.
 */
export interface IToncenterV3Indexer {
    /** Indexed Toncenter v3 endpoint used by this client. */
    readonly endpoint: string;

    /**
     * Resolves TON transaction context by hash using an indexed backend.
     * Accepts any TON transaction hash format supported by the indexer, including hashes from
     * any point in the same linked chain of TON transactions.
     * @param transactionHash TON transaction hash to resolve in the indexed backend.
     * @returns Indexed transaction with owning account context, or null if not found.
     */
    getTransactionByHash(transactionHash: string): Promise<ToncenterV3IndexedTransaction | null>;

    getTransactionsByMessageHash(
        messageHash: string,
        direction: 'in' | 'out',
    ): Promise<ToncenterV3IndexedTransaction[]>;

    /**
     * Resolves adjacent indexed transactions for the provided hash from the same linked chain of TON transactions.
     * The result may contain both parent and child transactions.
     * @param transactionHash TON transaction hash to resolve around.
     * @returns Adjacent indexed transactions, or an empty array when none were found.
     */
    getAdjacentTransactions(transactionHash: string): Promise<ToncenterV3IndexedTransaction[]>;

    /**
     * Traverses the linked chain of TON transactions in both directions starting from any TON transaction hash
     * from that linked transaction chain, and returns the transaction on crossChainLayer that the sequencer would collect
     * as a TVM event.
     * @param transactionHash Any TON transaction hash from the target linked chain of TON transactions.
     * @param crossChainLayerAddress crossChainLayer address whose sequencer-collected event transaction should be found in that linked chain of TON transactions.
     * @param params Optional traversal settings. Defaults are applied when omitted.
     * @returns Indexed crossChainLayer transaction that matches the sequencer event collector rules, or null if it was not found.
     */
    findCollectibleCrossChainLayerTransaction(
        transactionHash: string,
        crossChainLayerAddress: string,
        params?: ToncenterV3TraversalParams,
    ): Promise<ToncenterV3IndexedTransaction | null>;
}
