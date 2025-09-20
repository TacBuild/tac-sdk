# Simulator Interface

## Table of Contents

- [Simulator Interface](#simulator-interface)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Interface Methods](#interface-methods)
    - [`getSimulationInfo`](#getsimulationinfo)
    - [`getSimulationsInfo`](#getsimulationsinfo)
  - [Example Usage](#example-usage)

---

## Overview

The `ISimulator` interface defines methods for simulating cross-chain transactions and estimating execution fees. It provides functionality to simulate individual transactions or batches of transactions for fee estimation and validation purposes.

---

## Interface Methods

### `getSimulationInfo`

```ts
getSimulationInfo(sender: SenderAbstraction, tx: CrosschainTx): Promise<ExecutionFeeEstimationResult>
```

#### **Purpose**

Simulates a single cross-chain transaction and provides fee estimation and execution info. This method uses the sender abstraction to provide transaction context such as wallet state.

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

Simulates multiple cross-chain transactions and provides fee estimation results for each transaction. This method is useful for batch simulation and fee estimation.

#### **Parameters**

- **`sender`**: A [`SenderAbstraction`](./sender.md) instance used to provide context (e.g., wallet state) for all simulations
- **`txs`**: An array of [`CrosschainTx`](./../models/structs.md#crosschaintx) objects representing the cross-chain transactions to simulate

#### **Returns** `Promise<ExecutionFeeEstimationResult[]>`

Returns an array of [`ExecutionFeeEstimationResult`](./../models/structs.md#executionfeeestimationresult) objects, one for each input transaction in the same order.

---

## Example Usage

```ts
import { ISimulator } from "@tonappchain/sdk";
import { SenderFactory } from "@tonappchain/sdk";
import { TonConnectUI } from '@tonconnect/ui';

// Assume you have an ISimulator implementation instance
const simulator: ISimulator = // ... get simulator instance

// Create a sender
const tonConnectUI = new TonConnectUI({
    manifestUrl: 'https://example.com/tonconnect-manifest.json'
});
const sender = await SenderFactory.getSender({
    tonConnect: tonConnectUI
});

// Create a cross-chain transaction
const crosschainTx: CrosschainTx = {
    evmProxyMsg: {
        evmTargetAddress: "0x...",
        methodName: "swap",
        encodedParameters: "0x..."
    },
    assets: [asset1, asset2],
    options: {
        // transaction options
    }
};

// Simulate a single transaction
const simulationResult = await simulator.getSimulationInfo(sender, crosschainTx);

console.log("Fee estimation:", simulationResult);

// Simulate multiple transactions
const transactions: CrosschainTx[] = [crosschainTx1, crosschainTx2];
const simulationResults = await simulator.getSimulationsInfo(sender, transactions);

console.log("Batch simulation results:", simulationResults);
```