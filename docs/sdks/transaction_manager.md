# TransactionManager Class

## Table of Contents

- [TransactionManager Class](#transactionmanager-class)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Creating an Instance of `TransactionManager`](#creating-an-instance-of-transactionmanager)
  - [Core Functions](#core-functions)
    - [`sendCrossChainTransaction`](#sendcrosschaintransaction)
      - [**Purpose**](#purpose)
      - [**Parameters**](#parameters)
      - [**Returns** `TransactionLinkerWithOperationId`](#returns-transactionlinkerwithoperationid)
      - [**Possible exceptions**](#possible-exceptions)
    - [`sendCrossChainTransactions`](#sendcrosschaintransactions)
      - [**Purpose**](#purpose-1)
      - [**Parameters**](#parameters-1)
      - [**Returns** `Promise<TransactionLinkerWithOperationId[]>`](#returns-promisetransactionlinkerwithoperationid)
    - [`bridgeTokensToTON`](#bridgetokenstoton)
      - [**Purpose**](#purpose-2)
      - [**Parameters**](#parameters-2)
      - [**Returns** `Promise<string>`](#returns-promisestring)
  - [Example Usage](#example-usage)
    - [Integration with Other Components](#integration-with-other-components)

---

## Overview

`TransactionManager` is responsible for preparing, sending, and managing cross-chain transactions between TON and TAC networks. It handles token aggregation, message generation, balance checking, and transaction execution.

**Key Features:**
- **Unified Token Interface**: Uses the refactored `generatePayload` method with object parameters across all token types (Jetton, NFT, TON)
- **Dependency Injection**: Accepts `ISimulator` and `IOperationTracker` interfaces for improved testability
- **Batch Processing**: Supports sending multiple cross-chain transactions simultaneously
- **Fee Management**: Handles protocol, executor, and forward fees with intelligent distribution
- **Balance Checking**: Validates sufficient TON balance before transaction execution
- **Operation Tracking**: Provides optional waiting mechanisms for transaction completion
- **Auto Gas Limit**: If `evmProxyMsg.gasLimit` is not provided, it is auto-populated from the simulation result.
- **Shard Count Logic**: Internally, shardCount is computed as the number of Jettons plus NFTs (or 1 when none), which defines how many shard messages are created.

---

## Creating an Instance of `TransactionManager`

```ts
new TransactionManager(
  config: IConfiguration,
  simulator: ISimulator,
  operationTracker: IOperationTracker,
  logger?: ILogger,
  options?: {
    evmDataCellBuilder?: (transactionLinker: TransactionLinker, evmProxyMsg: EvmProxyMsg, validExecutors: ValidExecutors) => Cell;
  }
)
```

Creates a TransactionManager instance with the required dependencies.

**Parameters:**
- `config`: Configuration object implementing `IConfiguration`
- `simulator`: Simulator instance implementing `ISimulator` for transaction simulation
- `operationTracker`: OperationTracker instance implementing `IOperationTracker` for tracking operations
- `logger` *(optional)*: Logger implementing `ILogger` (defaults to `NoopLogger`)
- `options` *(optional)*: Options object with `evmDataCellBuilder` function for customizing the EVM data cell builder

---

## Core Functions



---

### `sendCrossChainTransaction`

```ts
sendCrossChainTransaction(
  evmProxyMsg: EvmProxyMsg,
  sender: SenderAbstraction,
  assets?: Asset[],
  options?: CrossChainTransactionOptions,
  waitOptions?: WaitOptions<string>
): Promise<TransactionLinkerWithOperationId>
```

#### **Purpose**

Sends a single cross-chain transaction from TON to TAC. This method prepares the transaction, checks balances, sends it to the network, and optionally waits for operation completion.

#### **Parameters**

- **`evmProxyMsg`**: An [`EvmProxyMsg`](./../models/structs.md#evmproxymsg-type) object defining the EVM operation
- **`sender`**: A [`SenderAbstraction`](./sender.md) object representing the transaction sender
- **`assets`** *(optional)*: Array of `Asset` objects to be included
- **`options`** *(optional)*: [`CrossChainTransactionOptions`](./../models/structs.md#crosschaintransactionoptions-type) for transaction customization
- **`waitOptions`** *(optional)*: [`WaitOptions`](./operation_tracker.md#waiting-for-results) for operation tracking

Notes:
- If `options.evmValidExecutors` or `options.tvmValidExecutors` are omitted or empty, defaults from `config.getTrustedTACExecutors` and `config.getTrustedTONExecutors` are used.
- If `evmProxyMsg.gasLimit` is not provided, it will be auto-populated from the simulation result.

#### **Returns** [`TransactionLinkerWithOperationId`](./../models/structs.md#transactionlinkerwithoperationid-type)

Returns an object containing:
- `sendTransactionResult`: Result of the transaction sending operation
- `operationId` *(optional)*: Operation ID if waiting was enabled
- Transaction linker properties for tracking

#### **Possible exceptions**

- **`InsufficientBalanceError`**: Thrown when sender has insufficient TON balance
- **`SimulationError`**: Thrown when transaction simulation fails
- **`ContractError`**: Thrown when required contracts are not deployed

---

### `sendCrossChainTransactions`

```ts
sendCrossChainTransactions(
  sender: SenderAbstraction,
  txs: CrosschainTx[],
  waitOptions?: WaitOptions<OperationIdsByShardsKey>
): Promise<TransactionLinkerWithOperationId[]>
```

#### **Purpose**

Sends multiple cross-chain transactions in a batch. This method is useful for scenarios where multiple independent operations need to be initiated from TON to TAC simultaneously.

#### **Parameters**

- **`sender`**: A [`SenderAbstraction`](./sender.md) object representing the transaction sender
- **`txs`**: Array of [`CrosschainTx`](./../models/structs.md#crosschaintx-type) objects, each defining a single cross-chain transaction
- **`waitOptions`** *(optional)*: [`WaitOptions`](./operation_tracker.md#waiting-for-results) for operation tracking

#### **Returns** `Promise<TransactionLinkerWithOperationId[]>`

Returns an array of [`TransactionLinkerWithOperationId`](./../models/structs.md#transactionlinkerwithoperationid-type) objects, one for each transaction sent.

---

### `bridgeTokensToTON`

```ts
bridgeTokensToTON(
  signer: Wallet,
  value: bigint,
  tonTarget: string,
  assets?: Asset[],
  tvmExecutorFee?: bigint,
  tvmValidExecutors?: string[]
): Promise<string>
```

#### **Purpose**

Bridges tokens from TAC to TON by sending a message to the TAC cross-chain layer. This method handles token approvals, fee calculations, and message encoding.

#### **Parameters**

- **`signer`**: An ethers `Wallet` instance for signing the transaction
- **`value`**: Amount of native TAC tokens to send with the transaction
- **`tonTarget`**: Target address on TON network
- **`assets`** *(optional)*: Array of [`Asset`](./../models/structs.md#asset-interface) objects to bridge
- **`tvmExecutorFee`** *(optional)*: Custom TVM executor fee (if not provided, will be calculated)
- **`tvmValidExecutors`** *(optional)*: Array of trusted TON executor addresses to restrict the set of executors used for estimation and execution on TVM.

#### **Returns** `Promise<string>`

Returns the transaction hash of the bridging transaction.

---



---

## Example Usage

```ts
import { TransactionManager, Simulator, OperationTracker, Configuration, ConsoleLogger, Network } from "@tonappchain/sdk";
import { testnet } from "@tonappchain/artifacts";

// Create dependencies
const config = await Configuration.create(Network.TESTNET, testnet);
const simulator = new Simulator(config);
const operationTracker = new OperationTracker(Network.TESTNET);
const logger = new ConsoleLogger();

// Create TransactionManager
const transactionManager = new TransactionManager(
  config,
  simulator,
  operationTracker,
  logger
);

// Note: prepareCrossChainTransaction is a private method, so it's not directly accessible.
// It's used internally by sendCrossChainTransaction and sendCrossChainTransactions.

// Send a single cross-chain transaction
const result = await transactionManager.sendCrossChainTransaction(
  evmProxyMsg,
  sender,
  [asset1],
  options,
  {
    timeout: 300000,
    maxAttempts: 30
  }
);

// Send multiple cross-chain transactions
const results = await transactionManager.sendCrossChainTransactions(
  sender,
  [
    { evmProxyMsg: msg1, assets: [asset1] },
    { evmProxyMsg: msg2, assets: [asset2] }
  ],
  waitOptions
);

// Bridge tokens from TAC to TON
const txHash = await transactionManager.bridgeTokensToTON(
  signer,
  toNano(0.1),
  "EQ...",
  [asset1, asset2],
  toNano(0.05)
);
```

### Integration with Other Components

```ts
// Using with TacSdk (pass a logger if you want console output; otherwise it is silent by default)
const sdk = await TacSdk.create({ network: Network.TESTNET }, new ConsoleLogger());

// The TacSdk internally uses TransactionManager for cross-chain operations
const result = await sdk.sendCrossChainTransaction(
  evmProxyMsg,
  sender,
  assets,
  options,
  waitOptions
);
```