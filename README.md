# TAC JavaScript Library 

[![Version npm](https://img.shields.io/npm/v/@tonappchain/sdk.svg?logo=npm)](https://www.npmjs.com/package/@tonappchain/sdk)
[![Downloads](https://img.shields.io/npm/dm/@tonappchain/sdk.svg)](https://www.npmjs.com/package/@tonappchain/sdk)
[![Try on RunKit](https://badge.runkitcdn.com/@tonappchain/sdk.svg)](https://runkit.com/npm/@tonappchain/sdk)


The TAC SDK makes it possible to create hybrid dApps that let TON users interact directly with EVM smart contracts without needing to manage multiple wallets or understand the complexities of cross-chain messaging.

### Documentation

For full documentation and examples, please visit [TAC SDK Documentation](https://docs.tac.build/build/sdk/introduction).

### Installation

```bash
npm install @tonappchain/sdk
```

or 

```bash
yarn add @tonappchain/sdk
```


## Features

The TAC SDK enables you to create frontends that:

- Connect to TON wallets like Tonkeeper or Tonhub
- Send transactions from TON to your EVM contracts
- Track cross-chain transaction status in real-time
- Handle tokens across both chains
- Create a seamless user experience for TON users

![TAC SDK](./tac-sdk.png)


## Available Resources


### SDK Components

- **[`TacSdk`](./docs/sdks/tac_sdk.md)**: The main class for interacting with the TAC protocol.
  - [`create (static)`](./docs/sdks/tac_sdk.md#create-static): Initializes the SDK instance.
  - [`sendCrossChainTransaction`](./docs/sdks/tac_sdk.md#sendcrosschaintransaction): Sends a cross-chain transaction from TON to TAC.
  - [`simulateTACMessage`](./docs/sdks/tac_sdk.md#simulatetacmessage): Simulates a TAC-side execution for gas estimation.
  - [`getEVMTokenAddress`](./docs/sdks/tac_sdk.md#getevmtokenaddress): Gets the TAC address for a TON token.
  - [`getTVMTokenAddress`](./docs/sdks/tac_sdk.md#gettvmtokenaddress): Gets the TON address for a TAC token.
  - [`getUserJettonBalance`](./docs/sdks/tac_sdk.md#getuserjettonbalance): Gets a user's Jetton balance (raw).
  - [`getUserJettonBalanceExtended`](./docs/sdks/tac_sdk.md#getuserjettonbalanceextended): Gets extended Jetton balance info (including decimals).
  - [`getUserJettonWalletAddress`](./docs/sdks/tac_sdk.md#getuserjettonwalletaddress): Calculates a user's Jetton wallet address.
  - [`nativeTONAddress (getter)`](./docs/sdks/tac_sdk.md#nativetonaddress-getter): Placeholder address for native TON.
  - [`nativeTACAddress (getter)`](./docs/sdks/tac_sdk.md#nativetacaddress-getter): Gets the native asset address on the TAC chain.
  - [`closeConnections`](./docs/sdks/tac_sdk.md#closeconnections): Closes underlying network connections.

- **[`OperationTracker`](./docs/sdks/operation_tracker.md)**: Tools for monitoring cross-chain operation status.
  - [`constructor`](./docs/sdks/operation_tracker.md#constructor): Creates a tracker instance.
  - [`getOperationId`](./docs/sdks/operation_tracker.md#getoperationid): Retrieves the Operation ID from a `TransactionLinker`.
  - [`getOperationType`](./docs/sdks/operation_tracker.md#getoperationtype): Gets the high-level type of an operation (Pending, Normal, Rollback).
  - [`getOperationStatus`](./docs/sdks/operation_tracker.md#getoperationstatus): Gets detailed status info for the current stage of an operation.
  - [`getSimplifiedOperationStatus`](./docs/sdks/operation_tracker.md#getsimplifiedoperationstatus): Gets a simplified overall status (Pending, Successful, Failed, Not Found).
  - [`getStageProfiling`](./docs/sdks/operation_tracker.md#getstageprofiling): Gets detailed timing and status for all stages of an operation.
  - [`getOperationIdsByShardsKeys`](./docs/sdks/operation_tracker.md#getoperationidsbyshardskeys): Batch fetches Operation IDs by `shardsKey`.
  - [`getStageProfilings`](./docs/sdks/operation_tracker.md#getstageprofilings): Batch fetches stage profiling data.
  - [`getOperationStatuses`](./docs/sdks/operation_tracker.md#getoperationstatuses): Batch fetches current operation statuses.

- **[`Senders`](./docs/sdks/senders.md)**: Handles signing and sending TON transactions.
  - [`SenderAbstraction`](./docs/sdks/senders.md#senderabstraction-interface) (Interface): Defines the contract for senders.
  - [`TonConnectSender`](./docs/sdks/senders.md#tonconnectsender): Implements sending via TonConnect UI.
  - [`RawSender`](./docs/sdks/senders.md#rawsender): Implements sending using a raw private key.
  - [`SenderFactory`](./docs/sdks/senders.md#senderfactory): Utility to easily create `TonConnectSender` or `RawSender`.

- **[`Utilities`](./docs/sdks/utilities.md)**: Helper functions and interfaces.
  - [`startTracking`](./docs/sdks/utilities.md#starttracking): Utility function to poll and log operation status to the console.
  - [`ContractOpener`](./docs/sdks/utilities.md#contractopener-interface) (Interface): Defines how the SDK connects to TON contracts.
  - [Contract Opener Functions](./docs/sdks/utilities.md#contract-opener-functions-orbsopener4-etc): Factories for creating `ContractOpener` instances (e.g., `orbsOpener4`, `liteClientOpener`).

### Data Models

- **[`Enums`](./docs/models/enums.md)**: Key enumerations used by the SDK.
  - [`Network`](./docs/models/enums.md#network): `TESTNET` or `MAINNET`.
  - [`SimplifiedStatuses`](./docs/models/enums.md#simplifiedstatuses): `PENDING`, `FAILED`, `SUCCESSFUL`, `OPERATION_ID_NOT_FOUND`.
  - [`OperationType`](./docs/models/enums.md#operationtype): Detailed operation types (`PENDING`, `TON_TAC_TON`, `ROLLBACK`, etc.).
  - [`StageName`](./docs/models/enums.md#stagename): Identifiers for tracking stages (`COLLECTED_IN_TAC`, `EXECUTED_IN_TAC`, etc.).

- **[`Structs`](./docs/models/structs.md)**: Core data structures.
  - [`AssetBridgingData`](./docs/models/structs.md#assetbridgingdata): Specifies assets to bridge (TON or Jettons).
  - [`EvmProxyMsg`](./docs/models/structs.md#evmproxymsg): Defines the target EVM call details.
  - [`TransactionLinker`](./docs/models/structs.md#transactionlinker): Identifies a cross-chain operation.
  - [`SDKParams`](./docs/models/structs.md#sdkparams): Configuration for `TacSdk.create`.
  - [`TACSimulationRequest`](./docs/models/structs.md#tacsimulationrequest): Input for simulating TAC calls.
  - [`TACSimulationResults`](./docs/models/structs.md#tacsimulationresults): Output from TAC simulation.
  - [`ExecutionStages`](./docs/models/structs.md#executionstages): Detailed profiling data for an operation.
  - [`StatusInfo`](./docs/models/structs.md#statusinfo): Status details for a single stage.
  - *(See file for more...)*

- **[`Interfaces`](./docs/models/interfaces.md)**: TypeScript interfaces defining contracts.
  - [`ContractOpener`](./docs/models/interfaces.md#contractopener): Interface for TON connection handlers.
  - [`SenderAbstraction`](./docs/models/interfaces.md#senderabstraction): Interface for transaction senders.
  - [`WalletInstance`](./docs/models/interfaces.md#walletinstance): Interface required for wallets used by `RawSender`.

- **[`Errors`](./docs/models/errors.md)**: Custom error types.
  - [`ErrorWithStatusCode`](./docs/models/errors.md#errorwithstatuscode): Base error class with an error code.
  - [`ContractError`](./docs/models/errors.md#contracterror), [`FetchError`](./docs/models/errors.md#fetcherror), [`AddressError`](./docs/models/errors.md#addresserror), etc.: Specific error categories.
  - [Pre-defined Instances](./docs/models/errors.md#pre-defined-error-instances): Specific error instances for common issues (e.g., `evmAddressError`, `simulationError`).

Navigate through the linked files for full details on parameters, return types, examples, and more.