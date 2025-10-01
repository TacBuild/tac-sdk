# Simulator

## Table of Contents

- [Simulator](#simulator)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Getting Simulator Instance](#getting-simulator-instance)
    - [Through SDK (Recommended)](#through-sdk-recommended)
    - [Direct Instantiation](#direct-instantiation)
  - [Methods](#methods)
    - [`getSimulationInfo`](#getsimulationinfo)
    - [`getSimulationsInfo`](#getsimulationsinfo)
  - [Example Usage](#example-usage)

---

## Overview

The `Simulator` class implements the `ISimulator` interface and provides methods for simulating cross-chain transactions and estimating execution fees. It offers functionality to simulate individual transactions or batches of transactions for fee estimation and validation purposes.

The simulator performs TAC-side simulation to estimate gas costs, validate transaction logic, and calculate the required fees for successful cross-chain execution.

---

## Getting Simulator Instance

There are two ways to obtain a simulator instance for transaction simulation. **Using the SDK approach is strongly recommended** as it handles all the configuration and dependencies automatically.

### Through SDK (Recommended)

The recommended approach is to use the `TacSdk` which creates and manages the simulator internally with proper configuration:

```ts
import { TacSdk, Network } from "@tonappchain/sdk";
import { TonApiClient } from '@ton-api/client';
import { getHttpV4Endpoint } from '@orbs-network/ton-access';

// Create SDK instance with simulator
const sdk = await TacSdk.create({
    network: Network.TESTNET, // or Network.MAINNET
});

// Use simulation methods directly on SDK
const simulationResult = await sdk.getSimulationInfo(evmProxyMsg, sender, assets, options);
const batchResults = await sdk.simulateTransactions(sender, transactions);
```

### Direct Instantiation

You can also create a simulator instance directly, but this requires manual setup of all dependencies:

```ts
import { 
    Simulator, 
    Configuration, 
    OperationTracker, 
    ConsoleLogger,
    Network 
} from "@tonappchain/sdk";
import { TonApiClient } from '@ton-api/client';
import { getHttpV4Endpoint } from '@orbs-network/ton-access';

// Create configuration
const config = await Configuration.create(
    Network.TESTNET,
    artifacts, // Network artifacts
    tonParams, // TON parameters
    tacParams, // TAC parameters
    customEndpoints, // Optional custom endpoints
    delay // Optional delay
);

// Create operation tracker
const operationTracker = new OperationTracker(Network.TESTNET, config.liteSequencerEndpoints);

// Create logger (optional)
const logger = new ConsoleLogger();

// Create simulator instance
const simulator = new Simulator(config, operationTracker, logger);

// Use simulator methods
const simulationResult = await simulator.getSimulationInfo(sender, crosschainTx);
const batchResults = await simulator.getSimulationsInfo(sender, transactions);
```

**Note**: The direct instantiation approach requires more setup and knowledge of internal dependencies. The SDK approach is recommended for most use cases as it provides a simpler API and handles configuration automatically.

---

## Methods

### `getSimulationInfo`

```ts
getSimulationInfo(sender: SenderAbstraction, tx: CrosschainTx): Promise<ExecutionFeeEstimationResult>
```

#### **Purpose**

Simulates a single cross-chain transaction and provides TVM fees and simulation info. This method performs TAC-side simulation to estimate gas costs, validate transaction logic, and calculate the required fees including protocol fees, executor fees, and gas limits. The sender abstraction is used to provide transaction context such as wallet state.

#### **Parameters**

- **`sender`**: A [`SenderAbstraction`](./sender.md) instance used to provide context (e.g., wallet state) for the simulation
- **`tx`**: A [`CrosschainTx`](./../models/structs.md#crosschaintx) object representing the cross-chain transaction to simulate

#### **Returns** [`ExecutionFeeEstimationResult`](./../models/structs.md#executionfeeestimationresult)

Returns detailed fee estimation and execution information for the simulated transaction.

---

### `getSimulationsInfo`

```ts
getSimulationsInfo(sender: SenderAbstraction, txs: CrosschainTx[]): Promise<ExecutionFeeEstimationResult[]>
```

#### **Purpose**

Simulates a list of cross-chain transactions for a given sender and provides fee estimation results for each transaction. This method is useful for batch simulation and fee estimation, processing each transaction sequentially and returning results in the same order as the input.

#### **Parameters**

- **`sender`**: A [`SenderAbstraction`](./sender.md) instance used to provide context (e.g., wallet state) for all simulations
- **`txs`**: An array of [`CrosschainTx`](./../models/structs.md#crosschaintx) objects representing the cross-chain transactions to simulate

#### **Returns** `Promise<ExecutionFeeEstimationResult[]>`

Returns an array of [`ExecutionFeeEstimationResult`](./../models/structs.md#executionfeeestimationresult) objects, one for each input transaction in the same order.

---

## Example Usage

```ts
import { TacSdk, Network, SenderFactory } from "@tonappchain/sdk";
import { TonConnectUI } from '@tonconnect/ui';
import { TonApiClient } from '@ton-api/client';
import { getHttpV4Endpoint } from '@orbs-network/ton-access';

// Create SDK instance (recommended approach)
const sdk = await TacSdk.create({
    network: Network.TESTNET
});

// Create a sender
const tonConnectUI = new TonConnectUI({
    manifestUrl: 'https://example.com/tonconnect-manifest.json'
});
const sender = await SenderFactory.getSender({
    tonConnect: tonConnectUI
});

// Create EVM proxy message
const evmProxyMsg = {
    evmTargetAddress: "0x...",
    methodName: "swap",
    encodedParameters: "0x..."
};

// Simulate a single transaction using SDK
const simulationResult = await sdk.getSimulationInfo(
    evmProxyMsg, 
    sender, 
    [asset1, asset2], // optional assets
    {
        // optional transaction options
        calculateRollbackFee: true,
        allowSimulationError: false
    }
);

console.log("Fee estimation:", simulationResult);

// Simulate multiple transactions using SDK
const transactions = [
    { evmProxyMsg: evmProxyMsg1, assets: [asset1], options: {} },
    { evmProxyMsg: evmProxyMsg2, assets: [asset2], options: {} }
];
const batchResults = await sdk.simulateTransactions(sender, transactions);

console.log("Batch simulation results:", batchResults);
```