# Simulator Class

## Table of Contents

- [Simulator Class](#simulator-class)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Creating an Instance of `Simulator`](#creating-an-instance-of-simulator)
  - [Core Functions](#core-functions)
    - [`simulateTACMessage`](#simulatetacmessage)
    - [`getTVMExecutorFeeInfo`](#gettvmexecutorfeeinfo)
    - [`getTransactionSimulationInfo`](#gettransactionsimulationinfo)
    - [`getSimulationInfoForTransaction`](#getsimulationinfofortransaction)
    - [`simulateTransactions`](#simulatetransactions)
  - [Internal Methods](#internal-methods)
    - [`aggregateTokens`](#aggregatetokens)
  - [Example Usage](#example-usage)

---

## Overview

`Simulator` is responsible for simulating cross-chain transactions and estimating execution fees. It provides methods to simulate TAC messages, calculate TVM executor fees, and get comprehensive transaction simulation information.

---

## Creating an Instance of `Simulator`

```ts
new Simulator(config: IConfiguration, logger?: ILogger, httpClient?: IHttpClient)
```

Creates a Simulator instance with the provided configuration and optional logger and HTTP client.

**Parameters:**
- `config`: Configuration object implementing `IConfiguration`
- `logger` *(optional)*: Logger implementing `ILogger` (defaults to `NoopLogger`)
- `httpClient` *(optional)*: HTTP client implementing `IHttpClient` (defaults to `AxiosHttpClient`)

---

## Core Functions

### `simulateTACMessage`

```ts
simulateTACMessage(req: TACSimulationRequest): Promise<TACSimulationResult>
```

#### **Purpose**

Simulates a TAC message by sending the request to lite sequencer endpoints. This method attempts to simulate the message on multiple endpoints for redundancy and reliability.

#### **Parameters**

- **`req`**: A [`TACSimulationRequest`](./../models/structs.md#tacsimulationrequest) object containing:
  - **`tacCallParams`**: EVM call parameters including target, method name, and arguments
  - **`evmValidExecutors`** *(optional)*: Array of trusted EVM executor addresses (defaults to `config.TACParams.trustedTACExecutors` if omitted)
  - **`tvmValidExecutors`** *(optional)*: Array of trusted TVM executor addresses (defaults to `config.TACParams.trustedTONExecutors` if omitted)
  - **`calculateRollbackFee`** *(optional)*: Whether to include rollback path fee in estimation (default: `true`)
  - **`extraData`** *(optional)*: Additional data for the simulation (default: `"0x"`)
  - **`shardsKey`**: Unique identifier for the transaction
  - **`tonAssets`**: Array of TON assets to be included in the simulation
  - **`tonCaller`**: TON caller address

#### **Returns** [`TACSimulationResult`](./../models/structs.md#tacsimulationresult)

Returns detailed simulation results including:
- `simulationStatus`: Boolean indicating if simulation was successful
- `estimatedGas`: Estimated gas consumption
- `suggestedTacExecutionFee`: Suggested TAC execution fee
- `suggestedTonExecutionFee`: Suggested TON execution fee
- `outMessages`: Array of outbound messages (if any)
- `simulationError`: Error message if simulation failed

#### **Possible exceptions**

- **`SimulationError`**: Thrown when simulation fails on all available endpoints

---

### `getTVMExecutorFeeInfo`

```ts
getTVMExecutorFeeInfo(assets: Asset[], feeSymbol: string, tvmValidExecutors?: string[]): Promise<SuggestedTONExecutorFee>
```

#### **Purpose**

Calculates the suggested TON executor fee based on the provided assets and fee symbol. This method queries the lite sequencer endpoints to get fee estimates for TVM operations.

#### **Parameters**

- **`assets`**: Array of [`Asset`](./assets.md#asset-interface) objects representing the assets to be processed
- **`feeSymbol`**: String representing the fee symbol (e.g., "TON", "TAC")
- **`tvmValidExecutors`** *(optional)*: Array of trusted TON executor addresses to restrict the set of executors used for estimation. Defaults to `config.TACParams.trustedTONExecutors` if omitted.

Note: The TON executor fee is determined as max(rollback_message, normal_execution) to account for the worst-case path.

#### **Returns** [`SuggestedTONExecutorFee`](./../models/structs.md#suggestedtonexecutorfee)

Returns an object containing:
- `inTAC`: Suggested fee amount in TAC
- `inTON`: Suggested fee amount in TON

#### **Possible exceptions**

- **`SimulationError`**: Thrown when fee calculation fails on all available endpoints

---

### `getTransactionSimulationInfo`

```ts
getTransactionSimulationInfo(
  evmProxyMsg: EvmProxyMsg,
  sender: SenderAbstraction,
  assets?: Asset[]
): Promise<ExecutionFeeEstimationResult>
```

#### **Purpose**

Provides comprehensive simulation information for a cross-chain transaction, including fee estimation and gas calculations. This method aggregates tokens and generates transaction linkers for accurate simulation.

#### **Parameters**

- **`evmProxyMsg`**: An [`EvmProxyMsg`](./../models/structs.md#evmproxymsg-type) object defining the EVM operation
- **`sender`**: A [`SenderAbstraction`](./sender.md) instance representing the transaction sender
- **`assets`** *(optional)*: Array of [`Asset`](./assets.md#asset-interface) objects to be included in the transaction

#### **Returns** [`ExecutionFeeEstimationResult`](./../models/structs.md#executionfeeestimationresult)

Returns detailed execution fee estimation including:
- `feeParams`: Detailed fee parameters (protocol fee, executor fees, gas limit)
- `simulation`: Complete simulation results

---

### `getSimulationInfoForTransaction`

```ts
getSimulationInfoForTransaction(
  evmProxyMsg: EvmProxyMsg,
  transactionLinker: TransactionLinker,
  assets: Asset[],
  allowSimulationError?: boolean,
  isRoundTrip?: boolean,
  evmValidExecutors?: string[],
  tvmValidExecutors?: string[],
  calculateRollbackFee?: boolean
): Promise<ExecutionFeeEstimationResult>
```

#### **Purpose**

Gets simulation information for a specific transaction using a pre-defined transaction linker. This method allows for more control over the simulation process and supports skipping simulation for force-send scenarios.

#### **Parameters**

- **`evmProxyMsg`**: An [`EvmProxyMsg`](./../models/structs.md#evmproxymsg-type) object defining the EVM operation
- **`transactionLinker`**: A [`TransactionLinker`](./../models/structs.md#transactionlinker-type) object for the transaction
- **`assets`**: Array of [`Asset`](./assets.md#asset-interface) objects to be included
- **`allowSimulationError`** *(optional)*: Boolean to skip simulation (default: `false`)
- **`isRoundTrip`** *(optional)*: Boolean indicating if this is a round-trip operation. If omitted, it is auto-detected as `assets.length !== 0`.
- **`evmValidExecutors`** *(optional)*: Array of trusted EVM executor addresses
- **`tvmValidExecutors`** *(optional)*: Array of trusted TVM executor addresses
- **`calculateRollbackFee`** *(optional)*: Whether to include rollback path fee in estimation (default: `true`)

#### **Returns** [`ExecutionFeeEstimationResult`](./../models/structs.md#executionfeeestimationresult)

Returns comprehensive execution fee estimation with simulation results.

---

### `simulateTransactions`

```ts
simulateTransactions(sender: SenderAbstraction, txs: CrosschainTx[]): Promise<TACSimulationResult[]>
```

#### **Purpose**

Simulates multiple cross-chain transactions in batch, similar to how `sendCrossChainTransactions` works. This method provides a convenient way to simulate multiple transactions using the same interface as the batch transaction sending functionality.

#### **Parameters**

- **`sender`**: A [`SenderAbstraction`](./sender.md) instance representing the transaction sender
- **`txs`**: An array of [`CrosschainTx`](./../models/structs.md#crosschaintx) objects, each containing:
  - **`evmProxyMsg`**: EVM proxy message defining the operation
  - **`assets`** *(optional)*: Array of assets to be included
  - **`options`** *(optional)*: Transaction options including executor settings

#### **Returns** [`TACSimulationResult[]`](./../models/structs.md#tacsimulationresult)

Returns an array of simulation results, one for each transaction in the input array. Each result contains:
- `simulationStatus`: Boolean indicating if simulation was successful
- `estimatedGas`: Estimated gas consumption for the transaction
- `suggestedTacExecutionFee`: Suggested TAC execution fee
- `suggestedTonExecutionFee`: Suggested TON execution fee
- Additional simulation data

---

## Internal Methods

### `aggregateTokens`

```ts
private aggregateTokens(assets?: Asset[]): Promise<{
  jettons: Asset[];
  nfts: Asset[];
  ton?: Asset; // native TON asset, if present
}>
```

Aggregates tokens by type, combining amounts for fungible tokens (summing identical jettons) and collecting unique NFTs. Also detects native TON amount as a separate Asset instance when present.

Notes:
- The shard count for transaction linker equals `jettons.length` (or 1 when there are no jettons).

**Returns:**
- `jettons`: Array of aggregated fungible tokens
- `nfts`: Array of unique NFTs
- `ton` (optional): Native TON asset instance if present

---

## Example Usage

```ts
import { Simulator, Configuration, Network } from "@tonappchain/sdk";
import { testnet } from "@tonappchain/artifacts";

// Create configuration
const config = await Configuration.create(Network.TESTNET, testnet);

// Create simulator
const simulator = new Simulator(config);

// Simulate a TAC message
const simulationResult = await simulator.simulateTACMessage({
  tacCallParams: {
    target: "0x...",
    methodName: "swap",
    arguments: "0x..."
  },
  evmValidExecutors: ["0x..."],
  extraData: "0x",
  shardsKey: "123",
  tonAssets: [],
  tonCaller: "EQ..."
});

// Get TVM executor fee info
const feeInfo = await simulator.getTVMExecutorFeeInfo([asset1, asset2], "TON");

// Get transaction simulation info
const txInfo = await simulator.getTransactionSimulationInfo(
  evmProxyMsg,
  sender,
  [asset1, asset2]
);

// Simulate multiple transactions (new method)
const batchResults = await simulator.simulateTransactions(sender, [
  {
    evmProxyMsg: {
      evmTargetAddress: "0x...",
      methodName: "swap",
      encodedParameters: "0x..."
    },
    assets: [asset1],
    options: { allowSimulationError: false }
  },
  {
    evmProxyMsg: {
      evmTargetAddress: "0x...",
      methodName: "addLiquidity"
    },
    assets: [asset1, asset2]
  }
]);
``` 