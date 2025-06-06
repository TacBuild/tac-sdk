# LiteSequencerClient Class

## Table of Contents

- [LiteSequencerClient Class](#litesequencerclient-class)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Getting Started](#getting-started)
  - [API Reference](#api-reference)
    - [Operation Type](#operation-type)
    - [Operation ID](#operation-id)
    - [Operation IDs by Shards Keys](#operation-ids-by-shards-keys)
    - [Stage Profiling](#stage-profiling)
    - [Operation Statuses](#operation-statuses)

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
  // Optional:
  maxChunkSize: number = 100
);
```

---

## API Reference

### Operation Type

```ts
getOperationType(operationId: string): Promise<OperationType>
```

Fetches the type of an operation by its ID.

**Returns:** [`OperationType`](./../models/enums.md#operationtype)

---

### Operation ID

```ts
getOperationId(transactionLinker: TransactionLinker): Promise<string>
```

Fetches the crosschain operation ID based on a transaction linker.

**Returns:** `string` - The operation ID, or empty string if not found (404)

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

**Returns:** [`OperationIdsByShardsKey`](./../models/structs.md#operationidsbyshardskey)

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

### Operation Statuses

```ts
getOperationStatuses(
  operationIds: string[],
  chunkSize?: number
): Promise<StatusInfosByOperationId>
```

Fetches status information for multiple operations. Handles request chunking automatically.

**Returns:** [`StatusInfosByOperationId`](./../models/structs.md#statusinfosbyoperationid) 