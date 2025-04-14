# SDK Data Structures (Structs)

This file documents the primary data structures (types and interfaces often referred to as structs) used for configuration, data transfer, and results within the TAC SDK.

**Table of Contents**

- [SDK Data Structures (Structs)](#sdk-data-structures-structs)
  - [Core Data Structures](#core-data-structures)
    - [`AssetBridgingData`](#assetbridgingdata)
    - [`EvmProxyMsg`](#evmproxymsg)
    - [`TransactionLinker`](#transactionlinker)
    - [`UserWalletBalanceExtended`](#userwalletbalanceextended)
    - [`SDKParams`](#sdkparams)
    - [`TONParams`](#tonparams)
    - [`TACParams`](#tacparams)
  - [Simulation \& Tracking Structures](#simulation--tracking-structures)
    - [`TACSimulationRequest`](#tacsimulationrequest)
    - [`TACSimulationResults`](#tacsimulationresults)
    - [`StatusInfo`](#statusinfo)
    - [`ExecutionStages`](#executionstages)
    - [`StatusInfosByOperationId`](#statusinfosbyoperationid)
    - [`ExecutionStagesByOperationId`](#executionstagesbyoperationid)
    - [`OperationIdsByShardsKey`](#operationidsbyshardskey)
    - [`TransactionData`](#transactiondata)
    - [`NoteInfo`](#noteinfo)
    - [`StageData`](#stagedata)
    - [`ProfilingStageData`](#profilingstagedata)

## Core Data Structures

These structs are fundamental for configuring the SDK and initiating cross-chain transactions.

### `AssetBridgingData`

Used in `TacSdk.sendCrossChainTransaction` to specify assets (TON or Jettons) to bridge. It's a union type:

- **`RawAssetBridgingData`**: `{ address?: string; rawAmount: bigint; }`
  - Requires the amount in the smallest indivisible units (e.g., nanoTONs or equivalent Jetton units).
- **`UserFriendlyAssetBridgingData`**: `{ address?: string; amount: number; decimals?: number; }`
  - Allows specifying a human-readable amount (e.g., 10.5 TON).
  - The SDK will attempt to fetch decimals from the chain if `decimals` is not provided and convert `amount` to `rawAmount` using `amount * (10^decimals)`.
- **`address`** (string, optional): The TON Jetton master address. If omitted or set to `sdk.nativeTONAddress` (`'NONE'`), it signifies native TON coin.

### `EvmProxyMsg`

Defines the target EVM call details for `TacSdk.sendCrossChainTransaction`.

- **`evmTargetAddress`** (string): The address of the contract to call on the TAC chain.
- **`methodName`** (string, optional): The Solidity method signature (e.g., `"transfer(address,uint256)"`). Required if `encodedParameters` is not provided.
- **`encodedParameters`** (string, optional): The ABI-encoded parameters for the method call (e.g., `"0x..."`). Required if `methodName` is not provided.
- **`gasLimit`** (bigint, optional): Gas limit for the TAC-side transaction. If omitted or `0n`, the SDK attempts to estimate it using `simulateTACMessage`.

### `TransactionLinker`

Object returned by `TacSdk.sendCrossChainTransaction` and used by `OperationTracker` to identify and track an operation.

- **`caller`** (string): The TON address that initiated the transaction.
- **`shardCount`** (number): The number of TON messages sent (usually 1, but can be more if bridging multiple different Jettons).
- **`shardsKey`** (string): A unique key identifying the set of TON messages belonging to this operation.
- **`timestamp`** (number): The Unix timestamp (seconds) when the linker was generated.
- **`sendTransactionResult`** (unknown, optional): The raw result returned by the underlying `SenderAbstraction`'s `sendShardTransaction` method.

### `UserWalletBalanceExtended`

Detailed balance info returned by `TacSdk.getUserJettonBalanceExtended`.

- **If Jetton Exists**: `{ exists: true; amount: number; rawAmount: bigint; decimals: number; }`
- **If Jetton Doesn't Exist**: `{ exists: false; }`

### `SDKParams`

Configuration object for `TacSdk.create`.

- **`network`** (Network): Required (`MAINNET` or `TESTNET`).
- **`delay`** (number, optional): Delay between TON reads (seconds). Default: `1.5`.
- **`TONParams`** (TONParams, optional): Custom TON parameters (see below).
- **`TACParams`** (TACParams, optional): Custom TAC parameters (see below).
- **`customLiteSequencerEndpoints`** (string[], optional): Override default sequencer URLs.

### `TONParams`

Optional TON-specific parameters within `SDKParams`.

- **`contractOpener`** (ContractOpener, optional): Custom contract opener. Default: `orbsOpener4`.
- **`settingsAddress`** (string, optional): Override default TON Settings contract address (for testing).

### `TACParams`

Optional TAC-specific parameters within `SDKParams` (mainly for advanced/testing scenarios).

- **`provider`** (AbstractProvider, optional): Custom ethers.js provider for TAC.
- **`settingsAddress`** (string | Addressable, optional): Override TAC Settings address.
- **`settingsABI`** (Interface | InterfaceAbi, optional): Override TAC Settings ABI.
- **`crossChainLayerABI`** (Interface | InterfaceAbi, optional): Override TAC CrossChainLayer ABI.
- **`crossChainLayerTokenABI`** (Interface | InterfaceAbi, optional): Override TAC CrossChainLayerToken ABI.
- **`crossChainLayerTokenBytecode`** (string, optional): Override TAC CrossChainLayerToken bytecode.

## Simulation & Tracking Structures

These structs are primarily used as inputs or outputs for the simulation and operation tracking features.

### `TACSimulationRequest`

Input object for `TacSdk.simulateTACMessage`.

- **`tonCaller`** (string): Initiating TON address.
- **`shardsKey`** (string): From `TransactionLinker`.
- **`tonAssets`** (Array<{ tokenAddress: string; amount: string }>): Assets being bridged (raw amounts as strings).
- **`tacCallParams`** ({ target: string; methodName: string; arguments: string }): EVM call details (target address, formatted method name, encoded arguments).
- **`feeAssetAddress`** (string, optional): Address of asset used for fees.
- **`extraData`** (string, optional): Additional data for the call.

### `TACSimulationResults`

Output object from `TacSdk.simulateTACMessage`.

- **`simulationStatus`** (boolean): Success or failure.
- **`estimatedGas`** (string): Estimated gas cost (if successful). Parse with `BigInt()`.
- **`message`** (string, optional): Error message if failed.
- **`simulationError`** (string, optional): Detailed error info.
- **`feeParams`** (object): Suggested gas price/tip info.
  - `currentBaseFee` (string)
  - `isEip1559` (boolean)
  - `suggestedGasPrice` (string)
  - `suggestedGasTip` (string)
- **`outMessages`** (object[] | null): Details of resulting messages/events on TAC.
- **`debugInfo`** (object): Info used for simulation call.
  - `from` (string)
  - `to` (string)
  - `callData` (string)
  - `blockNumber` (number)
- **`estimatedJettonFeeAmount`** (string): Estimated fee amount for Jetton operations.

### `StatusInfo`

Detailed status for a single operation stage, returned by `OperationTracker.getOperationStatus` and part of `StatusInfosByOperationId`.

- **`stage`** (StageName): The specific stage (e.g., `executedInTAC`).
- **`success`** (boolean): Whether this stage succeeded.
- **`timestamp`** (number): Timestamp of stage completion.
- **`transactions`** (TransactionData[] | null): Array of relevant transaction hashes for this stage.
- **`note`** (NoteInfo | null): Additional notes or error details.

### `ExecutionStages`

Comprehensive profiling data for an entire operation, returned by `OperationTracker.getStageProfiling` or `startTracking` (with `returnValue: true`).

- **`operationType`** (OperationType): The overall type of the operation.
- **Contains properties for each `StageName`** (e.g., `collectedInTAC`, `executedInTAC`, `executedInTON`). Each stage property holds a `ProfilingStageData` object (see below).

### `StatusInfosByOperationId`

Object mapping operation IDs to their `StatusInfo`, returned by `OperationTracker.getOperationStatuses`.

- **Type**: `Record<string, StatusInfo>`

### `ExecutionStagesByOperationId`

Object mapping operation IDs to their `ExecutionStages`, returned by `OperationTracker.getStageProfilings`.

- **Type**: `Record<string, ExecutionStages>`

### `OperationIdsByShardsKey`

Object mapping `shardsKey` values to their corresponding Operation ID(s), returned by `OperationTracker.getOperationIdsByShardsKeys`.

- **Type**: `Record<string, { operationIds: string[] }>` (Note: API actually returns `Record<string, string | null>`, this might need adjustment based on actual usage/return type).

### `TransactionData`

Represents a transaction hash within a stage's details.

- **`hash`** (string): The transaction hash.
- **`blockchainType`** (BlockchainType): `'TAC'` or `'TON'`.

### `NoteInfo`

Contains additional details or error information for a specific stage.

- **`content`** (string)
- **`errorName`** (string)
- **`internalMsg`** (string)
- **`internalBytesError`** (string)

### `StageData`

Core data associated with a single execution stage.

- **`success`** (boolean)
- **`timestamp`** (number)
- **`transactions`** (TransactionData[] | null)
- **`note`** (NoteInfo | null)

### `ProfilingStageData`

Wrapper for `StageData` within the `ExecutionStages` object, indicating if the stage was reached.

- **`exists`** (boolean): Whether this stage was reached.
- **`stageData`** (StageData | null): Detailed `StatusInfo`-like data for the stage if it exists. 