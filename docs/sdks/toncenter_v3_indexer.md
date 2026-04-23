# ToncenterV3Indexer

## Overview

`ToncenterV3Indexer` is an indexed traversal client used when the SDK needs to resolve any TON transaction hash from a linked chain of TON transactions and then find the `crossChainLayer` transaction that the sequencer would actually collect as a TVM event.

Its responsibilities are:

- `hash -> indexed TON transaction context`
- `hash -> adjacent indexed transactions`
- traversal in both directions through the same linked chain of TON transactions
- filtering `crossChainLayer` transactions by the same event rules that the sequencer collector uses

---

## `IToncenterV3Indexer`

```ts
export interface IToncenterV3Indexer {
  readonly endpoint: string;
  getTransactionByHash(transactionHash: string): Promise<ToncenterV3IndexedTransaction | null>;
  getAdjacentTransactions(transactionHash: string): Promise<ToncenterV3IndexedTransaction[]>;
  findCollectibleCrossChainLayerTransaction(
    transactionHash: string,
    crossChainLayerAddress: string,
    params?: ToncenterV3TraversalParams,
  ): Promise<ToncenterV3IndexedTransaction | null>;
}
```

Interface for indexed TON transaction resolution.

- `endpoint`: base indexed endpoint used by the implementation
- `getTransactionByHash(...)`: resolves TON transaction context by hash and returns the owning account together with the indexed transaction hash
- `getAdjacentTransactions(...)`: returns indexed adjacent transactions for a hash
- `findCollectibleCrossChainLayerTransaction(...)`: traverses the linked chain of TON transactions in both directions and returns the collectible crossChainLayer event transaction that matches the sequencer collector rules
  accepts optional traversal params such as `maxDepth` and `maxScannedTransactions`

The SDK accepts a custom implementation through [`TONParams`](./../models/structs.md#tonparams-type) as `tonIndexer`.

---

## `ToncenterV3Indexer`

```ts
new ToncenterV3Indexer(
  endpoint: string,
  httpClient?: IHttpClient,
)
```

Creates a Toncenter v3 indexer client.

- `endpoint`: base indexed `/api/v3/` endpoint; the implementation appends `transactions` and `adjacentTransactions` itself
- `httpClient` *(optional)*: custom HTTP client, useful for tests

### Method

```ts
getTransactionByHash(transactionHash: string): Promise<ToncenterV3IndexedTransaction | null>
```

Looks up a transaction in Toncenter v3 indexed API.

- Accepts the TON hash format supported by the indexer
- Returns `null` for `404` or empty result
- Throws a wrapped fetch error for other transport failures

```ts
getAdjacentTransactions(transactionHash: string): Promise<ToncenterV3IndexedTransaction[]>
```

Loads adjacent transactions for the provided hash from Toncenter v3 indexed API.

- Returns both parent and child transactions when available
- Returns an empty array for `404` or empty result

```ts
findCollectibleCrossChainLayerTransaction(
  transactionHash: string,
  crossChainLayerAddress: string,
  params?: ToncenterV3TraversalParams,
): Promise<ToncenterV3IndexedTransaction | null>
```

Traverses the indexed linked chain of TON transactions in both directions starting from any TON transaction hash from that linked chain of TON transactions.

- Accepts a transaction hash from any point in the linked chain of TON transactions
- Stops when it finds the collectible crossChainLayer transaction that the sequencer would collect as a TVM event
- Treats a transaction as collectible when it is on `crossChainLayer` and contains an external outbound log message in `out_msgs`
- Uses default traversal limits when `params` are omitted
- Returns `null` when the collectible crossChainLayer transaction was not found within traversal limits

---

## Response Shape

[`ToncenterV3IndexedTransaction`](./../models/structs.md#toncenterv3indexedtransaction-type)

- `account`: account address where the transaction was indexed
- `hash`: indexed TON transaction hash returned by Toncenter
- `traceId` *(optional)*: trace identifier when present in the response
- `outMsgs`: outgoing messages used to detect external outbound log messages from `crossChainLayer` transactions in that linked chain of TON transactions

---

## Usage

```ts
import { Network, TacSdk, ToncenterV3Indexer } from '@tonappchain/sdk';

const sdk = await TacSdk.create({
  network: Network.TESTNET,
  TONParams: {
    tonIndexer: new ToncenterV3Indexer('https://toncenter-spb.tac.build/api/v3/'),
  },
});

const operationId = await sdk.getOperationIdByTonTransactionHash(
  '0xa41ac40e63cb9aa683fe4702d2fc358afa896877cb21582cc841db7a6d0556b2',
);
```
