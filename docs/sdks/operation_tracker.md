# OperationTracker Class

Provides methods to track the status and details of cross-chain operations

**Table of Contents**

- [OperationTracker Class](#operationtracker-class)
  - [`constructor`](#constructor)
  - [`getOperationType`](#getoperationtype)
  - [`getOperationId`](#getoperationid)
  - [`getOperationIdsByShardsKeys`](#getoperationidsbyshardskeys)
  - [`getStageProfiling`](#getstageprofiling)
  - [`getStageProfilings`](#getstageprofilings)
  - [`getOperationStatuses`](#getoperationstatuses)
  - [`getOperationStatus`](#getoperationstatus)
  - [`getSimplifiedOperationStatus`](#getsimplifiedoperationstatus)

## `constructor`

Creates an instance of the `OperationTracker`.

**Parameters**

- `network` (Network): The network (`Network.MAINNET` or `Network.TESTNET`) the tracker will query.
- `customLiteSequencerEndpoints` (string[], optional): Allows overriding the default Lite Sequencer endpoints for the specified network.

**Returns**

- `OperationTracker`: A new instance of the tracker.

```ts
import { OperationTracker, Network } from '@tonappchain/sdk';

const tracker = new OperationTracker(Network.TESTNET);
// const trackerWithCustomEndpoints = new OperationTracker(Network.MAINNET, ['https://custom-sequencer.com']);

console.log('Operation Tracker Initialized');
```

## `getOperationType`

Retrieves the type of a cross-chain operation (e.g., Pending, Normal, Rollback) based on its unique Operation ID.

**Parameters**

- `operationId` (string): The unique identifier for the operation.

**Returns**

- `Promise<OperationType>`: A promise resolving to the type of the operation (`OperationType.PENDING`, `OperationType.NORMAL`, `OperationType.ROLLBACK`, `OperationType.UNKNOWN`).

**Throws**

- `OperationFetchError`: If the operation type cannot be fetched from any Lite Sequencer endpoint.

```ts
// Assuming 'tracker' is an initialized OperationTracker instance
// Assuming 'opId' holds a valid operation ID
const opId = '...'; 

async function logOperationType() {
  try {
    const opType = await tracker.getOperationType(opId);
    console.log(`Operation Type for ${opId}:`, opType);
  } catch (error) {
    console.error('Error fetching operation type:', error);
  }
}

logOperationType();
```

## `getOperationId`

Retrieves the unique Operation ID associated with a specific TON-side transaction, identified by its `TransactionLinker`.

**Parameters**

- `transactionLinker` (TransactionLinker): The object returned by `TacSdk.sendCrossChainTransaction`, containing `shardsKey`, `caller`, `shardCount`, and `timestamp`.

**Returns**

- `Promise<string>`: A promise resolving to the unique Operation ID. Returns an empty string (`''`) if the operation is not found (e.g., not yet processed by the sequencer), but doesn't throw an error in that specific case.

**Throws**

- `OperationFetchError`: If there's a network error or the sequencer cannot be reached after checking all endpoints.

```ts
import { TransactionLinker } from '@tonappchain/sdk';
// Assuming 'tracker' is an initialized OperationTracker instance
// Assuming 'txLinker' is a valid TransactionLinker object obtained from sendCrossChainTransaction

const txLinker: TransactionLinker = {
  shardsKey: '...', 
  caller: 'UQ...',
  shardCount: 1,
  timestamp: 1678886400, // Example timestamp
  sendTransactionResult: { /* ... result from sender ... */ }
};

async function logOperationId() {
  try {
    const opId = await tracker.getOperationId(txLinker);
    if (opId) {
      console.log('Operation ID found:', opId);
    } else {
      console.log('Operation ID not found yet.');
    }
  } catch (error) {
    console.error('Error fetching operation ID:', error);
  }
}

logOperationId();
```

## `getOperationIdsByShardsKeys`

Retrieves multiple Operation IDs based on a list of `shardsKey` values and the caller address. Useful for batch lookups.

**Parameters**

- `shardsKeys` (string[]): An array of `shardsKey` strings obtained from `TransactionLinker` objects.
- `caller` (string): The TON address of the sender for these operations.

**Returns**

- `Promise<OperationIdsByShardsKey>`: A promise resolving to an object mapping each provided `shardsKey` to its corresponding Operation ID (or `null` if not found).

**Throws**

- `OperationFetchError`: If the operation IDs cannot be fetched from any Lite Sequencer endpoint.

```ts
// Assuming 'tracker' is an initialized OperationTracker instance
const keysToLookup = ['key1...', 'key2...'];
const senderAddress = 'UQ...';

async function logMultipleOperationIds() {
  try {
    const opIdMap = await tracker.getOperationIdsByShardsKeys(keysToLookup, senderAddress);
    console.log('Operation IDs by Shards Key:', opIdMap);
    // Example: { 'key1...': 'opId123', 'key2...': null } 
  } catch (error) {
    console.error('Error fetching multiple operation IDs:', error);
  }
}

logMultipleOperationIds();
```

## `getStageProfiling`

Retrieves detailed timing and status information for each stage of a single cross-chain operation.

**Parameters**

- `operationId` (string): The unique identifier for the operation.

**Returns**

- `Promise<ExecutionStages>`: A promise resolving to an object detailing the execution stages (e.g., `TACReceive`, `TACEvmExecution`, `TONFinalize`) with their status and timestamps.

**Throws**

- `ProfilingFetchError`: If profiling data cannot be fetched.
- `Error`: If no profiling data is found for the given `operationId` in the response.

```ts
// Assuming 'tracker' is an initialized OperationTracker instance
// Assuming 'opId' holds a valid operation ID
const opId = 'opId123...'; 

async function logStageProfiling() {
  try {
    const stages = await tracker.getStageProfiling(opId);
    console.log(`Stage Profiling for ${opId}:`, stages);
  } catch (error) {
    console.error('Error fetching stage profiling:', error);
  }
}

logStageProfiling();
```

## `getStageProfilings`

Retrieves detailed timing and status information for each stage of multiple cross-chain operations in a single batch request.

**Parameters**

- `operationIds` (string[]): An array of unique operation identifiers.

**Returns**

- `Promise<ExecutionStagesByOperationId>`: A promise resolving to an object mapping each provided `operationId` to its corresponding `ExecutionStages` details.

**Throws**

- `EmptyArrayError`: If the `operationIds` array is empty or null.
- `ProfilingFetchError`: If profiling data cannot be fetched from any Lite Sequencer endpoint.

```ts
// Assuming 'tracker' is an initialized OperationTracker instance
const opIdsToProfile = ['opId123...', 'opId456...']; 

async function logMultipleStageProfilings() {
  try {
    const profilingsMap = await tracker.getStageProfilings(opIdsToProfile);
    console.log('Stage Profilings by Operation ID:', profilingsMap);
    // Example: { 'opId123...': { /* stages */ }, 'opId456...': { /* stages */ } }
  } catch (error) {
    console.error('Error fetching multiple stage profilings:', error);
  }
}

logMultipleStageProfilings();
```

## `getOperationStatuses`

Retrieves the current status information for multiple cross-chain operations in a single batch request.

**Parameters**

- `operationIds` (string[]): An array of unique operation identifiers.

**Returns**

- `Promise<StatusInfosByOperationId>`: A promise resolving to an object mapping each provided `operationId` to its corresponding `StatusInfo` (which includes status, timestamps, transaction hashes, etc.).

**Throws**

- `EmptyArrayError`: If the `operationIds` array is empty or null.
- `StatusFetchError`: If status data cannot be fetched from any Lite Sequencer endpoint.

```ts
// Assuming 'tracker' is an initialized OperationTracker instance
const opIdsToGetStatus = ['opId123...', 'opId456...']; 

async function logMultipleStatuses() {
  try {
    const statusesMap = await tracker.getOperationStatuses(opIdsToGetStatus);
    console.log('Statuses by Operation ID:', statusesMap);
    // Example: { 'opId123...': { status: '...', txHash: '...' }, ... }
  } catch (error) {
    console.error('Error fetching multiple statuses:', error);
  }
}

logMultipleStatuses();
```

## `getOperationStatus`

Retrieves the current status information for a single cross-chain operation.

**Parameters**

- `operationId` (string): The unique identifier for the operation.

**Returns**

- `Promise<StatusInfo>`: A promise resolving to the `StatusInfo` object for the given operation.

**Throws**

- `StatusFetchError`: If status data cannot be fetched or if the specific `operationId` is not found in the response from the sequencer.

```ts
// Assuming 'tracker' is an initialized OperationTracker instance
// Assuming 'opId' holds a valid operation ID
const opId = 'opId123...';

async function logSingleStatus() {
  try {
    const statusInfo = await tracker.getOperationStatus(opId);
    console.log(`Status for ${opId}:`, statusInfo);
  } catch (error) {
    console.error('Error fetching status:', error);
  }
}

logSingleStatus();
```

## `getSimplifiedOperationStatus`

Provides a high-level, simplified status for a cross-chain operation based on its `TransactionLinker`. It first attempts to find the Operation ID and then determines if the operation is Pending, Successful, Failed, or Not Found.

**Parameters**

- `transactionLinker` (TransactionLinker): The object returned by `TacSdk.sendCrossChainTransaction`.

**Returns**

- `Promise<SimplifiedStatuses>`: A promise resolving to one of the enum values: 
  - `SimplifiedStatuses.OPERATION_ID_NOT_FOUND`
  - `SimplifiedStatuses.PENDING`
  - `SimplifiedStatuses.SUCCESSFUL`
  - `SimplifiedStatuses.FAILED`

**Throws**

- Can throw `OperationFetchError` if fetching the Operation ID or Operation Type fails beyond the initial check.

```ts
import { TransactionLinker, SimplifiedStatuses } from '@tonappchain/sdk';
// Assuming 'tracker' is an initialized OperationTracker instance
// Assuming 'txLinker' is a valid TransactionLinker object

const txLinker: TransactionLinker = {
  shardsKey: '...', 
  caller: 'UQ...',
  shardCount: 1,
  timestamp: 1678886400, // Example timestamp
  sendTransactionResult: { /* ... result from sender ... */ }
};

async function logSimplifiedStatus() {
  try {
    const simplifiedStatus = await tracker.getSimplifiedOperationStatus(txLinker);
    console.log('Simplified Status:', simplifiedStatus);

    switch (simplifiedStatus) {
      case SimplifiedStatuses.SUCCESSFUL:
        console.log('Operation completed successfully!');
        break;
      case SimplifiedStatuses.PENDING:
        console.log('Operation is pending.');
        break;
      case SimplifiedStatuses.FAILED:
        console.log('Operation failed (rolled back).');
        break;
      case SimplifiedStatuses.OPERATION_ID_NOT_FOUND:
        console.log('Operation ID not found yet, might still be processing.');
        break;
    }
  } catch (error) {
    console.error('Error fetching simplified status:', error);
  }
}

logSimplifiedStatus();
``` 