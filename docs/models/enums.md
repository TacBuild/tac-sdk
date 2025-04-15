# SDK Enums

This file documents the enumerations exported by the TAC SDK.

## `Network`

Specifies the target blockchain network.

- **`TESTNET = 'testnet'`**: TON Testnet and its corresponding TAC test network.
- **`MAINNET = 'mainnet'`**: TON Mainnet and its corresponding TAC main network.

```ts
import { Network } from '@tonappchain/sdk';

const currentNetwork = Network.TESTNET;
```

## `SimplifiedStatuses`

High-level statuses for cross-chain operations, typically returned by `OperationTracker.getSimplifiedOperationStatus`.

- **`PENDING = 'PENDING'`**: The operation is still being processed.
- **`FAILED = 'FAILED'`**: The operation failed (e.g., rolled back).
- **`SUCCESSFUL = 'SUCCESSFUL'`**: The operation completed successfully.
- **`OPERATION_ID_NOT_FOUND = 'OPERATION_ID_NOT_FOUND'`**: The operation ID could not be found by the tracker (might be too early or the transaction failed before reaching the sequencer).

```ts
import { SimplifiedStatuses } from '@tonappchain/sdk';

function checkStatus(status: SimplifiedStatuses) {
  if (status === SimplifiedStatuses.SUCCESSFUL) {
    console.log('Done!');
  }
}
```

## `OperationType`

Detailed operation types returned by `OperationTracker.getOperationType` and included in `ExecutionStages`.

- **`PENDING = 'PENDING'`**: Operation is awaiting processing.
- **`TON_TAC_TON = 'TON-TAC-TON'`**: A standard operation originating on TON, executing on TAC, and potentially finalizing back on TON.
- **`ROLLBACK = 'ROLLBACK'`**: The operation failed on TAC and is being rolled back on TON.
- **`TON_TAC = 'TON-TAC'`**: An operation originating on TON and executing on TAC (no return step).
- **`TAC_TON = 'TAC-TON'`**: An operation originating on TAC and executing on TON (less common for SDK users).
- **`UNKNOWN = 'UNKNOWN'`**: The operation type could not be determined.

```ts
import { OperationType } from '@tonappchain/sdk';

function getOpDescription(opType: OperationType): string {
  switch (opType) {
    case OperationType.PENDING: return "Pending";
    case OperationType.ROLLBACK: return "Failed (Rollback)";
    // ... other cases
    default: return "Unknown";
  }
}
```

## `StageName`

Identifiers for the different stages tracked in the `ExecutionStages` object returned by operation tracking methods.

- **`COLLECTED_IN_TAC = 'collectedInTAC'`**: The message from TON has been observed and collected by the TAC bridge contracts.
- **`INCLUDED_IN_TAC_CONSENSUS = 'includedInTACConsensus'`**: The collected message has been included in a consensus block on the TAC chain.
- **`EXECUTED_IN_TAC = 'executedInTAC'`**: The cross-chain message and associated EVM call have been executed on the TAC chain.
- **`COLLECTED_IN_TON = 'collectedInTON'`**: (For TON_TAC_TON or ROLLBACK) The result or rollback message from TAC has been observed by the TON bridge contracts.
- **`INCLUDED_IN_TON_CONSENSUS = 'includedInTONConsensus'`**: (For TON_TAC_TON or ROLLBACK) The result/rollback message has been included in a consensus block on the TON chain.
- **`EXECUTED_IN_TON = 'executedInTON'`**: (For TON_TAC_TON or ROLLBACK) The finalization or rollback logic has been executed on the TON chain.

```ts
import { StageName, ExecutionStages } from '@tonappchain/sdk';

function checkTacExecution(stages: ExecutionStages) {
  const tacExecStage = stages[StageName.EXECUTED_IN_TAC];
  if (tacExecStage?.exists && tacExecStage.stageData?.success) {
    console.log('TAC execution was successful!');
  }
}
``` 

### `TokenSymbol`

```ts
export enum TokenSymbol {
    TAC_SYMBOL = 'TAC',
    TON_SYMBOL = 'TON',
}
```

Enumeration of supported token symbols.

- **`TAC_SYMBOL`**:  
  Represents the native token on the TAC (EVM-compatible) network.

- **`TON_SYMBOL`**:  
  Represents the native token on the TON network.

