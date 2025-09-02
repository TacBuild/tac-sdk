# OperationTracker Class

## Table of Contents

- [OperationTracker Class](#operationtracker-class)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [How Tracking Works](#how-tracking-works)
  - [Getting Started](#getting-started)
    - [Constructor](#constructor)
    - [Example Usage](#example-usage)
  - [Architecture](#architecture)
    - [Key Components](#key-components)
      - [`ILiteSequencerClientFactory`](#ilitesequencerclientfactory)
      - [`ILiteSequencerClient`](#ilitesequencerclient)
    - [Failover Strategy](#failover-strategy)
  - [Waiting for Results](#waiting-for-results)
  - [Tracking by Transaction Link](#tracking-by-transaction-link)
    - [`getOperationId`](#getoperationid)
    - [`getOperationIdByTransactionHash`](#getoperationidbytransactionhash)
    - [`getSimplifiedOperationStatus`](#getsimplifiedoperationstatus)
  - [Detailed Operation Info](#detailed-operation-info)
    - [`getOperationStatus`](#getoperationstatus)
  - [**Note:** This method internally calls `getOperationStatuses` with a single operation ID and extracts the result.](#note-this-method-internally-calls-getoperationstatuses-with-a-single-operation-id-and-extracts-the-result)
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

### Constructor

```ts
new OperationTracker(
  network: Network,
  customLiteSequencerEndpoints?: string[],
  logger?: ILogger,
  clientFactory?: ILiteSequencerClientFactory
)
```

Creates a new OperationTracker instance.

**Parameters:**
- `network`: Network type (TESTNET or MAINNET)
- `customLiteSequencerEndpoints` *(optional)*: Custom sequencer endpoints. If not provided, uses default endpoints for the network
- `logger` *(optional)*: Logger implementation (defaults to `NoopLogger`)
- `clientFactory` *(optional)*: Factory for creating sequencer clients (defaults to `DefaultLiteSequencerClientFactory`)

### Example Usage

```ts
import { OperationTracker, Network } from "@tonappchain/sdk";
import { ConsoleLogger } from "@tonappchain/sdk";

// Basic usage with defaults
const tracker = new OperationTracker(Network.TESTNET);

// With custom endpoints and logging
const trackerWithOptions = new OperationTracker(
  Network.TESTNET,
  ["https://your-sequencer.com"], // customLiteSequencerEndpoints
  new ConsoleLogger(), // logger
  // clientFactory (optional)
);
```

---

## Architecture

`OperationTracker` implements the `IOperationTracker` interface and uses multiple `ILiteSequencerClient` instances internally to provide high availability and automatic failover.

### Key Components

#### `ILiteSequencerClientFactory`
Factory interface for creating sequencer clients. The default implementation (`DefaultLiteSequencerClientFactory`) creates `LiteSequencerClient` instances.

#### `ILiteSequencerClient`
Interface that defines the operations supported by sequencer clients:
- `getOperationType(operationId: string): Promise<OperationType>`
- `getOperationId(transactionLinker: TransactionLinker): Promise<string>`
- `getOperationIdByTransactionHash(transactionHash: string): Promise<string>`
- `getOperationIdsByShardsKeys(shardsKeys: string[], caller: string, chunkSize?: number): Promise<OperationIdsByShardsKey>`
- `getStageProfilings(operationIds: string[], chunkSize?: number): Promise<ExecutionStagesByOperationId>`
- `getOperationStatuses(operationIds: string[], chunkSize?: number): Promise<StatusInfosByOperationId>`

### Failover Strategy

1. Each endpoint is wrapped in its own `ILiteSequencerClient` implementation
2. Requests are tried on each client in sequence until one succeeds
3. If all clients fail, an `AllEndpointsFailedError` is thrown

This architecture provides:
- **High Availability**: Automatic failover if an endpoint is down
- **Load Distribution**: Requests spread across multiple endpoints
- **Testability**: Interface-based design allows for easy mocking and testing
- **Consistent Interface**: Same API regardless of endpoint availability

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
     * Logger
     */
    logger?: ILogger;
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

Fetches the cross-chain `operationId` based on a transaction linker. Tries each endpoint in sequence until successful.

**Parameters:**
- `transactionLinker`: Transaction linker object containing sharding information
- `waitOptions` *(optional)*: Wait configuration for automatic retrying

**Returns:** Operation ID string (empty string if not found)

**Note:** Returns an empty string if the operation ID has not been assigned yet. Use `waitOptions` with a custom `successCheck` to wait for a non-empty result.

---

### `getOperationIdByTransactionHash`

```ts
getOperationIdByTransactionHash(
    transactionHash: string,
    waitOptions?: WaitOptions<string>
): Promise<string>
```

Fetches the cross-chain `operationId` by a transaction hash. The hash can be either an ETH-style hash (`0x...` 32 bytes) or a TON hash. The tracker automatically routes the request to the correct underlying API.

**Parameters:**
- `transactionHash`: TAC (EVM) or TON transaction hash
- `waitOptions` *(optional)*: Wait configuration for automatic retrying

**Returns:** Operation ID string (empty string if not found)

**Note:** Returns an empty string if the operation ID has not been assigned yet. Use `waitOptions` with a custom `successCheck` to wait for a non-empty result.

---

### `getSimplifiedOperationStatus`

```ts
getSimplifiedOperationStatus(transactionLinker: TransactionLinker): Promise<SimplifiedStatuses>
```

Gets a simplified status for an operation based on its transaction linker. This method combines multiple queries internally to determine the overall operation state.

**Parameters:**
- `transactionLinker`: Transaction linker object containing sharding information

**Returns:** [`SimplifiedStatuses`](./../models/enums.md#simplifiedstatuses)

**Status Logic:**
- `OPERATION_ID_NOT_FOUND`: Operation ID not yet assigned
- `PENDING`: Operation type is PENDING or UNKNOWN
- `FAILED`: Operation type is ROLLBACK
- `SUCCESSFUL`: Operation completed successfully

**Internal Process:**
1. Fetches operation ID using the transaction linker
2. If no operation ID, returns `OPERATION_ID_NOT_FOUND`
3. Fetches operation type
4. Maps operation type to simplified status

---

## Detailed Operation Info

### `getOperationStatus`

```ts
getOperationStatus(
    operationId: string,
    waitOptions?: WaitOptions<StatusInfo>
): Promise<StatusInfo>
```

Retrieves detailed status information for a single operation.

**Parameters:**
- `operationId`: The operation ID to query
- `waitOptions` *(optional)*: Wait configuration for automatic retrying

**Returns:** [`StatusInfo`](./../models/structs.md#statusinfo)

**Note:** This method internally calls `getOperationStatuses` with a single operation ID and extracts the result.
---

### `getOperationStatuses`

```ts
getOperationStatuses(
    operationIds: string[],
    waitOptions?: WaitOptions<StatusInfosByOperationId>,
    chunkSize?: number
): Promise<StatusInfosByOperationId>
```

Retrieves status information for multiple operations in a single call. Processes requests in chunks for better performance.

**Parameters:**
- `operationIds`: Array of operation IDs to query
- `waitOptions` *(optional)*: Wait configuration for automatic retrying
- `chunkSize` *(optional)*: Number of items to process per request (default: 100)

**Returns:** [`StatusInfosByOperationId`](./../models/structs.md#statusinfosbyoperationId)

---

## Execution Profiling

### `getStageProfiling`

```ts
getStageProfiling(
    operationId: string,
    waitOptions?: WaitOptions<ExecutionStages>
): Promise<ExecutionStages>
```

Retrieves detailed execution stage information for a single operation. Useful for debugging or understanding delays in cross-chain flow.

**Parameters:**
- `operationId`: The operation ID to query
- `waitOptions` *(optional)*: Wait configuration for automatic retrying

**Returns:** [`ExecutionStages`](./../models/structs.md#executionstages)

**Note:** This method internally calls `getStageProfilings` with a single operation ID and extracts the result.

---

### `getStageProfilings`

```ts
getStageProfilings(
    operationIds: string[],
    waitOptions?: WaitOptions<ExecutionStagesByOperationId>,
    chunkSize?: number
): Promise<ExecutionStagesByOperationId>
```

Retrieves execution stage profiling information for multiple operations. Processes requests in chunks for better performance.

**Parameters:**
- `operationIds`: Array of operation IDs to query
- `waitOptions` *(optional)*: Wait configuration for automatic retrying  
- `chunkSize` *(optional)*: Number of items to process per request (default: 100)

**Returns:** [`ExecutionStagesByOperationId`](./../models/structs.md#executionstagesbyoperationid)

---

## Other Metadata

### `getOperationType`

```ts
getOperationType(
    operationId: string,
    waitOptions?: WaitOptions<OperationType>
): Promise<OperationType>
```

Retrieves the operation type classification for a given operation ID.

**Parameters:**
- `operationId`: The operation ID to query
- `waitOptions` *(optional)*: Wait configuration for automatic retrying

**Returns:** [`OperationType`](./../models/enums.md#operationtype)

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

Maps TON shard keys (with caller address) to operation IDs. Processes requests in chunks for better performance.

**Parameters:**
- `shardsKeys`: Array of shard keys to query
- `caller`: Caller's address
- `waitOptions` *(optional)*: Wait configuration for automatic retrying
- `chunkSize` *(optional)*: Number of items to process per request (default: 100)

**Returns:** [`OperationIdsByShardsKey`](./../models/structs.md#operationidsbyshardskey)