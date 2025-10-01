# TONTransactionManager

## Table of Contents

- [TONTransactionManager](#tontransactionmanager)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Constructor](#constructor)
  - [`sendCrossChainTransaction`](#sendcrosschaintransaction)
  - [`sendCrossChainTransactions`](#sendcrosschaintransactions)
  - [Integration with TacSdk](#integration-with-tacsdk)
  - [Example Usage](#example-usage)
    - [Using via TacSdk (Recommended)](#using-via-tacsdk-recommended)
    - [Direct Usage (Advanced)](#direct-usage-advanced)
    - [Error Handling](#error-handling)

---

## Overview

`TONTransactionManager` implements the `ITONTransactionManager` interface and handles cross-chain transactions from TON to TAC.

**Key Features:**
- **Unified Token Interface**: Uses the refactored `generatePayload` method with object parameters across all token types (Jetton, NFT, TON)
- **Dependency Injection**: Accepts `ISimulator` and `IOperationTracker` interfaces for improved testability
- **Batch Processing**: Supports sending multiple cross-chain transactions simultaneously
- **Fee Management**: Handles protocol, executor, and forward fees with intelligent distribution
- **Balance Checking**: Validates sufficient TON balance before transaction execution
- **Operation Tracking**: Provides optional waiting mechanisms for transaction completion
- **Auto Gas Limit**: If `evmProxyMsg.gasLimit` is not provided, it is auto-populated from the simulation result
- **Shard Count Logic**: Internally, shardCount is computed as the number of Jettons plus NFTs (or 1 when none), which defines how many shard messages are created

---

## Constructor

```typescript
new TONTransactionManager(
  config: IConfiguration,
  simulator: ISimulator,
  operationTracker: IOperationTracker,
  logger?: ILogger
)
```

Creates a TONTransactionManager instance with the required dependencies.

**Parameters:**
- **`config`**: Configuration object implementing `IConfiguration`
- **`simulator`**: Simulator instance implementing `ISimulator` for transaction simulation
- **`operationTracker`**: OperationTracker instance implementing `IOperationTracker` for tracking operations
- **`logger`** *(optional)*: Logger implementing `ILogger` (defaults to `NoopLogger`)

---

## `sendCrossChainTransaction`

```typescript
async sendCrossChainTransaction(
  evmProxyMsg: EvmProxyMsg,
  sender: SenderAbstraction,
  tx: CrosschainTx
): Promise<TransactionLinkerWithOperationId>
```

### **Purpose**

Sends a single cross-chain transaction from TON to TAC. This method prepares the transaction, checks balances, sends it to the network, and optionally waits for operation completion.

### **Parameters**

- **`evmProxyMsg`**: An [`EvmProxyMsg`](./../models/structs.md#evmproxymsg-type) object defining the EVM operation
- **`sender`**: A [`SenderAbstraction`](./sender.md) instance representing the transaction sender
- **`tx`**: [`CrosschainTx`](./../models/structs.md#crosschaintx) cross-chain transaction data to bridge, including:
  - **`options.waitOperationId`** *(optional, default: true)*: Whether to wait for operation ID after sending
  - **`options.waitOptions`** *(optional)*: [`WaitOptions`](./operation_tracker.md#waiting-for-results) for operation tracking customization

### **Returns** [`TransactionLinkerWithOperationId`](./../models/structs.md#transactionlinkerwithoperationid-type)

Returns an object containing:
- `sendTransactionResult`: Result of the transaction sending operation
- `operationId` *(optional)*: Operation ID if waiting was enabled
- Transaction linker properties for tracking

### **Possible exceptions**

- **`InsufficientBalanceError`**: Thrown when sender has insufficient TON balance
- **`SimulationError`**: Thrown when transaction simulation fails
- **`ContractError`**: Thrown when required contracts are not deployed
- **`WalletError`**: Thrown when the transaction fails to send to the blockchain

---

## `sendCrossChainTransactions`

```typescript
async sendCrossChainTransactions(
  sender: SenderAbstraction,
  txs: BatchCrossChainTx[],
  options?: CrossChainTransactionsOptions
): Promise<TransactionLinkerWithOperationId[]>
```

### **Purpose**

Sends multiple cross-chain transactions in a batch from TON to TAC. This method is useful for scenarios where multiple independent operations need to be initiated simultaneously.

### **Parameters**

- **`sender`**: A [`SenderAbstraction`](./sender.md) instance representing the transaction sender
- **`txs`**: Array of [`BatchCrossChainTx`](./../models/structs.md#batchcrosschaintx) objects, each defining a single cross-chain transaction
  > **Note:** Individual transactions in batch operations cannot specify `waitOperationId` or `waitOptions` in their options as these are controlled at the batch level.
- **`options`** *(optional)*: [`CrossChainTransactionsOptions`](./../models/structs.md#crosschaintransactionsoptions) controlling batch-level behavior:
  - **`waitOperationIds`** *(optional, default: true)*: Whether to wait for operation IDs for all transactions in the batch
  - **`waitOptions`** *(optional)*: [`WaitOptions`](./operation_tracker.md#waiting-for-results) for customizing operation IDs waiting behavior

### **Returns** `Promise<TransactionLinkerWithOperationId[]>`

Returns an array of [`TransactionLinkerWithOperationId`](./../models/structs.md#transactionlinkerwithoperationid-type) objects, one for each transaction sent.

---

## Integration with TacSdk

`TONTransactionManager` is used internally by the main `TacSdk` class to power the main cross-chain transaction methods (`sendCrossChainTransaction` and `sendCrossChainTransactions`). The SDK automatically instantiates and manages this component, providing a unified interface while maintaining the architectural separation underneath.

---

## Example Usage

### Using via TacSdk (Recommended)

The recommended way to use the TON transaction manager is through the main `TacSdk` class, which handles the instantiation and coordination:

```typescript
import { TacSdk, Network, ConsoleLogger } from "@tonappchain/sdk";

// Create SDK instance
const sdk = await TacSdk.create({ 
  network: Network.TESTNET 
}, new ConsoleLogger());

// TON -> TAC transactions (uses TONTransactionManager internally)
const result = await sdk.sendCrossChainTransaction(
  evmProxyMsg,
  sender,
  assets,
  options,
  {
    timeout: 300000,
    maxAttempts: 30
  }
);

// Multiple TON -> TAC transactions
const results = await sdk.sendCrossChainTransactions(
  sender,
  [
    { evmProxyMsg: msg1, assets: [asset1] },
    { evmProxyMsg: msg2, assets: [asset2] }
  ],
  waitOptions
);
```

### Direct Usage (Advanced)

For advanced use cases, you can instantiate the TON transaction manager directly:

```typescript
import { 
  TONTransactionManager, 
  Configuration, 
  Simulator, 
  OperationTracker, 
  ConsoleLogger, 
  Network 
} from "@tonappchain/sdk";

// Create dependencies
const config = await Configuration.create(Network.TESTNET);
const simulator = new Simulator(config);
const operationTracker = new OperationTracker(Network.TESTNET);
const logger = new ConsoleLogger();

// Create TON Transaction Manager for TON -> TAC operations
const tonManager = new TONTransactionManager(
  config,
  simulator,
  operationTracker,
  logger
);

// Send TON -> TAC transaction
const tx: CrosschainTx = {
  assets: [tonAsset, jettonAsset],
  evmProxyMsg,
  options: {
    tvmExecutorFee: BigInt("50000000"),
    evmExecutorFee: BigInt("1000000000000000")
  }
};

const result = await tonManager.sendCrossChainTransaction(
  evmProxyMsg,
  sender,
  tx,
  { timeout: 30000 }
);
```

### Error Handling

The TON transaction manager includes comprehensive error handling:

```typescript
try {
  const result = await tonManager.sendCrossChainTransaction(
    evmProxyMsg,
    sender,
    tx,
    waitOptions
  );
  console.log('Transaction successful:', result.operationId);
} catch (error) {
  if (error instanceof InsufficientBalanceError) {
    console.error('Insufficient balance:', error.message);
  } else if (error instanceof SimulationError) {
    console.error('Simulation failed:', error.message);
  } else if (error instanceof ContractError) {
    console.error('Contract not deployed:', error.message);
  } else if (error instanceof WalletError) {
    console.error('Transaction send failed:', error.message);
  } else {
    console.error('Transaction failed:', error.message);
  }
}
```