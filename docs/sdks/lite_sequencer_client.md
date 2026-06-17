# LiteSequencerClient Class

## Table of Contents

- [LiteSequencerClient Class](#litesequencerclient-class)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Getting Started](#getting-started)
  - [API Reference](#api-reference)
    - [Operation Type](#operation-type)
    - [Operation Type V2](#operation-type-v2)
    - [Operation ID](#operation-id)
    - [Operation ID by Transaction Hash](#operation-id-by-transaction-hash)
    - [Operation IDs by Shards Keys](#operation-ids-by-shards-keys)
    - [Stage Profiling](#stage-profiling)
    - [Stage Profiling V2](#stage-profiling-v2)
    - [Operation Statuses](#operation-statuses)
    - [Currency Conversion](#currency-conversion)
    - [TVM Executor Fee](#tvm-executor-fee)
    - [TAC Message Simulation](#tac-message-simulation)

---

## Overview

`LiteSequencerClient` is a low-level client for communicating with a single Lite Sequencer endpoint. It handles direct API calls, request chunking, and error handling for individual endpoint requests.

This class is typically used internally by `OperationTracker`, but can also be used independently when direct communication with a specific sequencer endpoint is needed.

---

## Getting Started

```ts
import { LiteSequencerClient } from "@tonappchain/sdk";

const client = new LiteSequencerClient(
  endpoint: string,
  maxChunkSize?: number, // Optional, defaults to 100
  httpClient?: IHttpClient // Optional, defaults to AxiosHttpClient
);
```

---

## API Reference

### Operation Type

```ts
getOperationType(operationId: string): Promise<OperationType>
```

Fetches the operation type of an operation by its ID.

**Returns:** [`OperationType`](./../models/enums.md#operationtype)

---

### Operation Type V2

```ts
getOperationTypeV2(operationId: string): Promise<OperationTypeV2Info>
```

Fetches the operation type and finalization state of an operation by its ID.

**Returns:** [`OperationTypeV2Info`](./../models/structs.md#operationtypev2info)

---

### Operation ID

```ts
getOperationId(transactionLinker: TransactionLinker): Promise<string>
```

Fetches the crosschain operation ID based on a transaction linker.

**Returns:** `string` - The operation ID, or empty string if not found (404)

---

### Operation ID by Transaction Hash

```ts
getOperationIdByTransactionHash(transactionHash: string): Promise<string>
```

Fetches the crosschain operation ID based on a transaction hash. The client automatically routes to the appropriate API depending on whether the hash is an ETH hash (`0x...` 32 bytes) or a TON hash.

**Returns:** `string` - The operation ID, or empty string if not found (404)

---

### Operation IDs by TAC Transaction Hash

```ts
getOperationIdByTacTransactionHash(transactionHash: string): Promise<OperationIdWithLogIndex[]>
```

Fetches TAC crosschain operation IDs for a TAC transaction hash from the explicit TAC sequencer route.

**Returns:** [`OperationIdWithLogIndex[]`](./../models/structs.md#operationidwithlogindex-type) - Array of operation IDs with log indexes, or an empty array if not found (404)

---

### Operation IDs by Shards Keys

```ts
getOperationIdsByShardsKeys(
  shardsKeys: string[],
  caller: string,
  chunkSize?: number
): Promise<OperationIdsByShardsKey>
```

Maps TON shard keys (with caller address) to operation IDs. Handles request chunking automatically.

**Returns:** [`OperationIdsByShardsKey`](./../models/structs.md#operationidsbyshardskey-type)

---

### Stage Profiling

```ts
getStageProfilings(
  operationIds: string[],
  chunkSize?: number
): Promise<ExecutionStagesByOperationId>
```

Fetches detailed execution stage information for multiple operations. Handles request chunking automatically.

**Returns:** [`ExecutionStagesByOperationId`](./../models/structs.md#executionstagesbyoperationid)

---

### Stage Profiling V2

```ts
getStageProfilingsV2(
  operationIds: string[],
  chunkSize?: number
): Promise<ExecutionStagesV2ByOperationId>
```

Fetches execution stage information for multiple operations, including top-level `finalized`, `status`, and `rollback` fields for each operation.

**Returns:** [`ExecutionStagesV2ByOperationId`](./../models/structs.md#executionstagesv2byoperationid)

---

### Operation Statuses

```ts
getOperationStatuses(
  operationIds: string[],
  chunkSize?: number
): Promise<StatusInfosByOperationId>
```

Fetches status information for multiple operations. Handles request chunking automatically.

**Returns:** [`StatusInfosByOperationId`](./../models/structs.md#statusinfosbyoperationid)

---

### Currency Conversion

```ts
convertCurrency(params: ConvertCurrencyParams): Promise<ConvertedCurrencyResult>
```

Converts currency amount using the sequencer-provided rate source.

**Parameters:**
- **`params`**: [`ConvertCurrencyParams`](./../models/structs.md#convertcurrencyparams) - Parameters for currency conversion

**Returns:** [`ConvertedCurrencyResult`](./../models/structs.md#convertedcurrencyresult)

---

### TVM Executor Fee

```ts
getTVMExecutorFee(params: GetTVMExecutorFeeParams): Promise<SuggestedTVMExecutorFee>
```

Gets TVM executor fee information for cross-chain operations.

**Parameters:**
- **`params`**: [`GetTVMExecutorFeeParams`](./../models/structs.md#gettvmexecutorfeeparams) - Parameters for fee calculation

**Returns:** [`SuggestedTVMExecutorFee`](./../models/structs.md#suggestedtvmexecutorfee)

---

### TAC Message Simulation

```ts
simulateTACMessage(params: TACSimulationParams): Promise<TACSimulationResult>
```

Simulates TAC message execution without broadcasting it on-chain. Useful for estimating fees and validating transaction inputs.

**Parameters:**
- **`params`**: [`TACSimulationParams`](./../models/structs.md#tacsimulationparams) - Simulation request with encoded message and context

**Returns:** [`TACSimulationResult`](./../models/structs.md#tacsimulationresult)
