# OperationTracker Class

## Table of Contents

- [Overview](#overview)
- [How Tracking Works](#how-tracking-works)
- [Getting Started](#getting-started)
- [Tracking by Transaction Link](#tracking-by-transaction-link)
  - [`getOperationId`](#getoperationid)
  - [`getSimplifiedOperationStatus`](#getsimplifiedoperationstatus)
- [Detailed Operation Info](#detailed-operation-info)
  - [`getOperationStatus`](#getoperationstatus)
  - [`getOperationStatuses`](#getoperationstatuses)
- [Execution Profiling](#execution-profiling)
  - [`getStageProfiling`](#getstageprofiling)
  - [`getStageProfilings`](#getstageprofilings)
- [Other Metadata](#other-metadata)
  - [`getOperationType`](#getoperationtype)
  - [`getOperationIdsByShardsKeys`](#getoperationidsbyshardskeys)

---

## Overview

`OperationTracker` allows monitoring the lifecycle of cross-chain transactions between TON and TAC.  
It queries the Lite Sequencer for status updates, execution breakdowns, and operation IDs associated with TON transactions.

---

## How Tracking Works

After calling `TacSdk.sendCrossChainTransaction(...)`, a [`TransactionLinker`](./../models/structs.md#transactionlinker-type) object is returned.  
This linker allows tracking status of the operation through these steps:

1. Use `getOperationId(linker)` to fetch the cross-chain operation ID.
2. Use `getOperationStatus(...)` or `getSimplifiedOperationStatus(...)` to get the current state.
3. For debugging or performance profiling, use `getStageProfiling(...)`.

> For automated polling, use [`startTracking()`](./utilities.md#starttracking) which handles all the above and prints status updates.

---

## Getting Started

```ts
import { OperationTracker, Network } from "@tonappchain/sdk";

const tracker = new OperationTracker(
  network: Network.TESTNET,
  // Optional:
  // customLiteSequencerEndpoints: ["https://your-sequencer.com"]
);
```

---

## Tracking by Transaction Link

### `getOperationId`

```ts
getOperationId(transactionLinker: TransactionLinker): Promise<string>
```

Fetches the crosschain `operationId` based on a transaction linker.

---

### `getSimplifiedOperationStatus`

```ts
getSimplifiedOperationStatus(transactionLinker: TransactionLinker): Promise<SimplifiedStatuses>
```

**Returns:** [`SimplifiedStatuses`](./../models/enums.md#simplifiedstatuses)

---

## Detailed Operation Info

### `getOperationStatus`

```ts
getOperationStatus(operationId: string): Promise<StatusInfo>
```

**Returns:** [`StatusInfo`](./../models/structs.md#statusinfo)
  - Latest status of a single operation.
---

### `getOperationStatuses`

```ts
getOperationStatuses(operationIds: string[]): Promise<StatusInfosByOperationId>
```

**Returns:** [`StatusInfo`](./../models/structs.md#statusinfosbyoperationId)
 - Multiple operation statuses in one call.

---

## Execution Profiling

### `getStageProfiling`

```ts
getStageProfiling(operationId: string): Promise<ExecutionStages>
```

**Returns:** [`ExecutionStages`](./../models/structs.md#executionstages)
  - Detailed breakdown of each stage in the operation lifecycle. Useful for debugging or understanding delays in cross-chain flow.

---

### `getStageProfilings`

```ts
getStageProfilings(operationIds: string[]): Promise<ExecutionStagesByOperationId>
```

**Returns:** [`ExecutionStagesByOperationId`](./../models/structs.md#executionstagesbyoperationid)
  - Profiling info for multiple operations in a single request.

---

## Other Metadata

### `getOperationType`

```ts
getOperationType(operationId: string): Promise<OperationType>
```

**Returns:** [`OperationType`](./../models/structs.md#operationtype)
  - Operation classification.

---

### `getOperationIdsByShardsKeys`

```ts
getOperationIdsByShardsKeys(shardsKeys: string[], caller: string): Promise<OperationIdsByShardsKey>
```

**Returns:** [`OperationIdsByShardsKey`](./../models/structs.md#operationddsbyshardskey)
  - Maps TON shard keys (with caller address) to operation IDs.