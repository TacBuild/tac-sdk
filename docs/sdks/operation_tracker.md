# OperationTracker Class

## Table of Contents

- [Overview](#overview)
- [How Tracking Works](#how-tracking-works)
- [Getting Started](#getting-started)
- [Tracking by Transaction Link](#tracking-by-transaction-link)
  - [`getOperationId`](#getoperationid)
  - [`getSimplifiedOperationStatus`](#getsimplifiedoperationstatus)
  - [`startTracking`](#starttracking)
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

After calling `TacSdk.sendCrossChainTransaction(...)`, a `TransactionLinker` object is returned.  
This linker allows tracking status of the operation through these steps:

1. Use `getOperationId(linker)` to fetch the cross-chain operation ID.
2. Use `getOperationStatus(...)` or `getSimplifiedOperationStatus(...)` to get the current state.
3. For debugging or performance profiling, use `getStageProfiling(...)`.

> For automated polling, use `startTracking()` which handles all the above and prints status updates.

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

Returns simplified status of the operation: `PENDING`, `SUCCESSFUL`, `FAILED`, `OPERATION_ID_NOT_FOUND`.

---

### `startTracking`

```ts
startTracking(
  transactionLinker: TransactionLinker,
  network: Network,
  options?: {
    customLiteSequencerEndpoints?: string[];
    delay?: number;
    maxIterationCount?: number;
    returnValue?: boolean;
    tableView?: boolean;
  }
): Promise<void | ExecutionStages>
```

Polls status repeatedly until the operation reaches final state.

- `delay`: polling interval in seconds (default: 10)
- `maxIterationCount`: max retries (default: 120)
- `returnValue = true`: return execution data instead of printing

---


### `startTracking`

```ts
startTracking(
  transactionLinker: TransactionLinker,
  network: Network,
  options?: {
    customLiteSequencerEndpoints?: string[];
    delay?: number;
    maxIterationCount?: number;
    returnValue?: boolean;
    tableView?: boolean;
  }
): Promise<void | ExecutionStages>
```

Tracks a crosschain operation end-to-end by polling the status using the transaction linker.  
It will continue until a final state (success or failure) is reached.

#### Parameters:
- `transactionLinker`: Result of `sendCrossChainTransaction(...)`
- `network`: `Network.TESTNET` or `Network.MAINNET`
- `options` *(optional)*:
  - `customLiteSequencerEndpoints`: override default sequencer URL
  - `delay`: polling interval in seconds (default: 10)
  - `maxIterationCount`: max polling attempts (default: 120)
  - `returnValue`: if `true`, returns profiling data instead of logging (default: `false`)
  - `tableView`: if `true`, logs formatted table output (default: `true`)

#### Returns:
- `Promise<void>` if `returnValue` is `false`
- `Promise<ExecutionStages>` if `returnValue` is `true`

#### Possible exceptions:
- `FetchError`: if operation status or ID could not be fetched from sequencer

#### Example:
```ts
await startTracking(transactionLinker, Network.TESTNET);
```

## Detailed Operation Info

### `getOperationStatus`

```ts
getOperationStatus(operationId: string): Promise<StatusInfo>
```

Returns latest status of a single operation.

**Returns:** `StatusInfo`

```ts
interface StatusInfo {
  stage: StageName;
  success: boolean;
  timestamp: number;
  transactions: TransactionData[] | null;
  note: NoteInfo | null;
}
```

---

### `getOperationStatuses`

```ts
getOperationStatuses(operationIds: string[]): Promise<StatusInfosByOperationId>
```

Returns multiple operation statuses in one call.

---

## Execution Profiling

### `getStageProfiling`

```ts
getStageProfiling(operationId: string): Promise<ExecutionStages>
```

Returns detailed breakdown of each stage in the operation lifecycle.  
Useful for debugging or understanding delays in cross-chain flow.

**Returns:** `ExecutionStages`

```ts
interface ExecutionStages {
  [stage in StageName]?: {
    success: boolean;
    timestamp: number;
  };
}
```

Each `StageName` can include:
- `COLLECTED_IN_TON`
- `INCLUDED_IN_TON_CONSENSUS`
- `EXECUTED_IN_TON`
- `COLLECTED_IN_TAC`
- `INCLUDED_IN_TAC_CONSENSUS`
- `EXECUTED_IN_TAC`

---

### `getStageProfilings`

```ts
getStageProfilings(operationIds: string[]): Promise<ExecutionStagesByOperationId>
```

Returns profiling info for multiple operations in a single request.

---

## Other Metadata

### `getOperationType`

```ts
getOperationType(operationId: string): Promise<OperationType>
```

Returns operation classification:

```ts
enum OperationType {
  PENDING,
  TON_TAC,
  TAC_TON,
  TON_TAC_TON,
  ROLLBACK,
  UNKNOWN
}
```

---

### `getOperationIdsByShardsKeys`

```ts
getOperationIdsByShardsKeys(shardsKeys: string[], caller: string): Promise<OperationIdsByShardsKey>
```

Maps TON shard keys (with caller address) to operation IDs.