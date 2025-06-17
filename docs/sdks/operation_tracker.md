# OperationTracker Class

## Table of Contents

- [OperationTracker Class](#operationtracker-class)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [How Tracking Works](#how-tracking-works)
  - [Getting Started](#getting-started)
  - [Architecture](#architecture)
  - [Waiting for Results](#waiting-for-results)
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
It queries multiple Lite Sequencer endpoints for status updates, execution breakdowns, and operation IDs associated with TON transactions, providing automatic failover if one endpoint fails.

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
  // customLiteSequencerEndpoints: ["https://your-sequencer.com"],
  // debug: true // Enable debug logging
);
```

---

## Architecture

`OperationTracker` uses multiple `LiteSequencerClient` instances internally to provide high availability and automatic failover:

1. Each endpoint is wrapped in its own `LiteSequencerClient`
2. Requests are tried on each client in sequence until one succeeds
3. If all clients fail, an error is thrown

This architecture provides:
- Automatic failover if an endpoint is down
- Load distribution across multiple endpoints
- Consistent interface regardless of endpoint availability

For more details about the underlying client, see [`LiteSequencerClient`](./lite_sequencer_client.md).

---

## Waiting for Results

All methods in `OperationTracker` support an optional `waitOptions` parameter that enables automatic retrying and waiting for successful results:

```ts
interface WaitOptions<T = unknown> {
    /**
     * Timeout in milliseconds
     * @default 300000 (5 minutes)
     */
    timeout?: number;
    /**
     * Maximum number of attempts
     * @default 30
     */
    maxAttempts?: number;
    /**
     * Delay between attempts in milliseconds
     * @default 10000 (10 seconds)
     */
    delay?: number;
    /**
     * Function to check if the result is successful
     * If not provided, any non-error result is considered successful
     */
    successCheck?: (result: T) => boolean;
}
```

Example usage:
```ts
// Wait for operation ID with custom options
const operationId = await tracker.getOperationId(transactionLinker, {
    timeout: 60000,     // 1 minute timeout
    maxAttempts: 10,    // 10 attempts
    delay: 5000,        // 5 seconds between attempts
    successCheck: (result) => result !== '' // Custom success check
});
```

---

## Tracking by Transaction Link

### `getOperationId`

```ts
getOperationId(
    transactionLinker: TransactionLinker,
    waitOptions?: WaitOptions<string>
): Promise<string>
```

Fetches the crosschain `operationId` based on a transaction linker. Tries each endpoint in sequence until successful.

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
getOperationStatus(
    operationId: string,
    waitOptions?: WaitOptions<StatusInfo>
): Promise<StatusInfo>
```

**Returns:** [`StatusInfo`](./../models/structs.md#statusinfo)
  - Latest status of a single operation.
---

### `getOperationStatuses`

```ts
getOperationStatuses(
    operationIds: string[],
    waitOptions?: WaitOptions<StatusInfosByOperationId>,
    chunkSize?: number
): Promise<StatusInfosByOperationId>
```

**Returns:** [`StatusInfosByOperationId`](./../models/structs.md#statusinfosbyoperationId)
 - Multiple operation statuses in one call.

---

## Execution Profiling

### `getStageProfiling`

```ts
getStageProfiling(
    operationId: string,
    waitOptions?: WaitOptions<ExecutionStages>
): Promise<ExecutionStages>
```

**Returns:** [`ExecutionStages`](./../models/structs.md#executionstages)
  - Detailed breakdown of each stage in the operation lifecycle. Useful for debugging or understanding delays in cross-chain flow.

---

### `getStageProfilings`

```ts
getStageProfilings(
    operationIds: string[],
    waitOptions?: WaitOptions<ExecutionStagesByOperationId>,
    chunkSize?: number
): Promise<ExecutionStagesByOperationId>
```

**Returns:** [`ExecutionStagesByOperationId`](./../models/structs.md#executionstagesbyoperationid)
  - Profiling info for multiple operations in a single request.

---

## Other Metadata

### `getOperationType`

```ts
getOperationType(
    operationId: string,
    waitOptions?: WaitOptions<OperationType>
): Promise<OperationType>
```

**Returns:** [`OperationType`](./../models/enums.md#operationtype)
  - Operation classification.

---

### `getOperationIdsByShardsKeys`

```ts
getOperationIdsByShardsKeys(
    shardsKeys: string[],
    caller: string,
    waitOptions?: WaitOptions<OperationIdsByShardsKey>,
    chunkSize?: number
): Promise<OperationIdsByShardsKey>
```

**Returns:** [`OperationIdsByShardsKey`](./../models/structs.md#operationidsbyshardskey)
  - Maps TON shard keys (with caller address) to operation IDs.