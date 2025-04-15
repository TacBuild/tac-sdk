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

## Tracking operation
The `OperationTracker` class is designed to track the status of crosschain operations by interacting with public or custom Lite Sequencer endpoints. It provides methods to fetch and interpret transaction statuses, enabling smooth monitoring of transaction lifecycles.

### Purpose

This class facilitates tracking crosschain operation statuses by:
1. Fetching the `operationId` for a TON transaction using the `transactionLinker` returned from `sendCrossChainTransaction` function in `TacSDK`.
2. Retrieving the current status of an operation using the `operationId`.
3. Returning a simplified status for easier operation monitoring.

To track an operation, follow these steps:

### 0. Create an Instance of OperationTracker

To use the `OperationTracker` class, initialize it with the required parameters (you can specify `customLiteSequencerEndpoints` for sending requests there):

```typescript
import { OperationTracker, Network } from '@tonappchain/sdk';

const tracker = new OperationTracker(
  network: Network.TESTNET,
  // customLiteSequencerEndpoints: ["custom.com"]
);
```

### 1. Get the `operationId`

Use the `getOperationId(transactionLinker)` method with the `transactionLinker` structure returned from `sendCrossChainTransaction` after sending TON transaction.

> **Note:** An empty response string indicates that validators have not yet received your messages. Continue retrying until you receive a non-empty `operationId`.


#### **Method: `getOperationId(transactionLinker: TransactionLinker): Promise<string>`**

#### **Parameters**:
  - `transactionLinker`: A `TransactionLinker` object containing TON transaction linkers.

#### **Returns**:
- **`Promise<string>`**: 
  - A string representing the `operationId`.

#### **Usage**:
  ```typescript
  const tracker = new OperationTracker(
        network: Network.TESTNET
  );
  const operationId = await tracker.getOperationId(transactionLinker);
  console.log('Operation ID:', operationId);
  ```

### 2. Check the Operation Status

Use the `getOperationStatus(operationId)` method to fetch the operation status.

#### **Method: `getOperationStatus(operationId: string): Promise<StatusInfo>`**

Retrieves the current status of an operation using its `operationId`.

#### **Parameters**:
  - `operationId`: The identifier obtained from `getOperationId`.

#### **Returns**:  
- **`Promise<StatusInfo>`**:  
  A structure representing the operation's status, including:  
  - **`stage`** A value of type `StageName` (enum) which can be one of:
    - `StageName.COLLECTED_IN_TAC` ('COLLECTED_IN_TAC')
    - `StageName.INCLUDED_IN_TAC_CONSENSUS` ('INCLUDED_IN_TAC_CONSENSUS') 
    - `StageName.EXECUTED_IN_TAC` ('EXECUTED_IN_TAC')
    - `StageName.COLLECTED_IN_TON` ('COLLECTED_IN_TON')
    - `StageName.INCLUDED_IN_TON_CONSENSUS` ('INCLUDED_IN_TON_CONSENSUS')
    - `StageName.EXECUTED_IN_TON` ('EXECUTED_IN_TON')
  - **`success`** (`boolean`): Indicates if the stage completed successfully.  
  - **`timestamp`** (`number`): UNIX timestamp of the stage’s completion.  
  - **`transactions`**: An array of `TransactionData` objects or null. Each transaction contains:
    - **`hash`**: A string with the transaction hash.
    - **`blockchainType`**: A `BlockchainType` indicating the blockchain (`TAC`, `TON`).
  - **`note`**: An object of type `NoteInfo` or null containing error/debug information:
    - **`content`**: A string with additional details.
    - **`errorName`**: A string representing the error name.
    - **`internalMsg`**: A string with an internal message.
    - **`internalBytesError`**: A string with internal error details in bytes.


#### **Usage**:
  ```typescript
  const tracker = new OperationTracker(
        network: Network.TESTNET
  );
  const status = await tracker.getOperationStatus(operationId);
  console.log('Stage:', status.stage)
  ```

---

### * Use Simplified Status (instead of 1 and 2 steps)

Use the `getSimplifiedOperationStatus(transactionLinker)` method for an easy-to-interpret status.

#### Method: `getSimplifiedOperationStatus(transactionLinker: TransactionLinker): Promise<SimplifiedStatuses>`

Fetches a simplified operation status using the `transactionLinker`.

#### **Parameters**:
  - `transactionLinker`: A `TransactionLinker` object returned from `sendCrossChainTransaction` function.

#### **Returns**:
- **`Promise<SimplifiedStatuses>`**:
  - A simplified status from the `SimplifiedStatuses` enum:
    - **`PENDING`**: The operation is still in progress.
    - **`SUCCESSFUL`**: The operation has successfully completed.
    - **`OPERATION_ID_NOT_FOUND`**: The operation ID could not be found.
    - **`FAILED`**: The operation failed.

#### **Usage**
Here operationId will be always requested(not optimal).
```typescript
const tracker = new OperationTracker();
const simplifiedStatus = await tracker.getSimpifiedOperationStatus(transactionLinker);
console.log('Simplified Status:', simplifiedStatus);
```

### Other functions
#### **Method: `getOperationType(operationId: string): Promise<OperationType>`**

Retrieves the current type of operation using its `operationId`.

#### **Parameters**:
  - `operationId`: The identifier obtained from `getOperationType`.

#### **Returns**:  
- **`Promise<OperationType>`**:  
- A type from the `operationType` enum:
  - **`PENDING`**: The operation is still in progress.
  - **`TON_TAC_TON`**: The operation has successfully completed in TON-TAC-TON.
  - **`ROLLBACK`**: The operation failed and there was an asset rollback.
  - **`TON_TAC`**: The operation has successfully completed in TON-TAC.
  - **`TAC_TON`**: The operation has successfully completed in TAC-TON.
  - **`UNKNOWN`**: unknown operation type.


#### Method: `getOperationIdsByShardsKeys(shardsKeys: string[], caller: string): Promise<OperationIdsByShardsKey>`

Retrieves operation IDs associated with specific shard keys for a given caller. Shard keys uniquely identify shards within the TON network, and this method maps them to their corresponding operation IDs.

##### **Parameters**

- **`shardsKeys`**: An array of shard keys for which operation IDs are to be fetched.
- **`caller`**: The address of the caller initiating the request.

##### **Returns**

- **`Promise<OperationIdsByShardsKey>`**: A promise that resolves to a mapping of shard keys to their corresponding operation IDs.


#### Method: `getStageProfiling(operationId: string): Promise<ExecutionStages>`

Fetches profiling information for all execution stages of operation identified by its operation ID.

##### **Parameters**

- **`operationId`**: The unique identifier of the operation whose profiling data is to be retrieved.

##### **Returns**

- **`Promise<ExecutionStages>`**: A promise that resolves to the profiling data of the operation's execution stages.


#### Method: `getStageProfilings(operationIds: string[]): Promise<ExecutionStagesByOperationId>`

Retrieves profiling information for multiple operations at once.

##### **Parameters**

- **`operationIds`**: An array of operation IDs for which profiling data is to be fetched.

##### **Returns**

- **`Promise<ExecutionStagesByOperationId>`**: A promise that resolves to a mapping of operation IDs to their corresponding execution stages profiling data.


#### Method: `getOperationStatuses(operationIds: string[]): Promise<StatusInfosByOperationId>`

Fetches the current status information for multiple operations based on their operation IDs. 

##### **Parameters**

- **`operationIds: string[]`**: An array of operation IDs whose statuses need to be retrieved.

##### **Returns**

- **`Promise<StatusInfosByOperationId>`**: A promise that resolves to a mapping of operation IDs to their respective status information.


---
### startTracking

Track the execution of crosschain operation with `startTracking` method

#### Method: `async function startTracking(transactionLinker: TransactionLinker, network: Network, options?: { customLiteSequencerEndpoints?: string[]; delay?: number; maxIterationCount?: number; returnValue?: boolean; tableView?: boolean; }): Promise<void | ExecutionStages>`

#### **Parameters**:
  - `transactionLinker`: A `TransactionLinker` object returned from `sendCrossChainTransaction` function.
  - `network`: TON network (`Network` type).
  - `options` *(optional)*:
    - `customLiteSequencerEndpoints` *(optional)*: specify custom lite sequencer API URL for sending requests there. Default is `undefined`
    - `delay` *(optional)*: specify custom delay after requests there. Default is `10`
    - `maxIterationCount` *(optional)*: specify custom max iteration count there. Default is `120`
    - `returnValue` *(optional)*: specify whether to return the data to you after tracking. When `false` will write to the console. Default is `false`
    - `tableView` *(optional)*: specify data display in the table. Default is `true`

#### **Returns**:
- Will stop requesting status once the final status of crosschain operation has been reached.
- if returnValue is `false` return `Promise<void>`
- if `true` return `Promise<ExecutionStages>` - execution stages profiling data.

#### **Possible exceptions**

- **`FetchError`**: failed to fetch operation id or status of operation from lite sequencer.

#### **Usage**
Here operationId will be always requested(not optimal).
```typescript
await startTracking(transactionLinker, network.TESTNET);
```

---
