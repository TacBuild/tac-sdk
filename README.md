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

![TAC SDK](https://mintlify.s3.us-west-1.amazonaws.com/tac-92ab2768/images/build/frontend-1.png)


## Available Resources


### SDK Components

- **[`TacSdk`](./sdks/tac_sdk.md)**: The main class for interacting with the TAC protocol.
  - [`create (static)`](./sdks/tac_sdk.md#create-static): Initializes the SDK instance.
  - [`sendCrossChainTransaction`](./sdks/tac_sdk.md#sendcrosschaintransaction): Sends a cross-chain transaction from TON to TAC.
  - [`simulateTACMessage`](./sdks/tac_sdk.md#simulatetacmessage): Simulates a TAC-side execution for gas estimation.
  - [`getEVMTokenAddress`](./sdks/tac_sdk.md#getevmtokenaddress): Gets the TAC address for a TON token.
  - [`getTVMTokenAddress`](./sdks/tac_sdk.md#gettvmtokenaddress): Gets the TON address for a TAC token.
  - [`getUserJettonBalance`](./sdks/tac_sdk.md#getuserjettonbalance): Gets a user's Jetton balance (raw).
  - [`getUserJettonBalanceExtended`](./sdks/tac_sdk.md#getuserjettonbalanceextended): Gets extended Jetton balance info (including decimals).
  - [`getUserJettonWalletAddress`](./sdks/tac_sdk.md#getuserjettonwalletaddress): Calculates a user's Jetton wallet address.
  - [`nativeTONAddress (getter)`](./sdks/tac_sdk.md#nativetonaddress-getter): Placeholder address for native TON.
  - [`nativeTACAddress (getter)`](./sdks/tac_sdk.md#nativetacaddress-getter): Gets the native asset address on the TAC chain.
  - [`closeConnections`](./sdks/tac_sdk.md#closeconnections): Closes underlying network connections.

- **[`OperationTracker`](./sdks/operation_tracker.md)**: Tools for monitoring cross-chain operation status.
  - [`constructor`](./sdks/operation_tracker.md#constructor): Creates a tracker instance.
  - [`getOperationId`](./sdks/operation_tracker.md#getoperationid): Retrieves the Operation ID from a `TransactionLinker`.
  - [`getOperationType`](./sdks/operation_tracker.md#getoperationtype): Gets the high-level type of an operation (Pending, Normal, Rollback).
  - [`getOperationStatus`](./sdks/operation_tracker.md#getoperationstatus): Gets detailed status info for the current stage of an operation.
  - [`getSimplifiedOperationStatus`](./sdks/operation_tracker.md#getsimplifiedoperationstatus): Gets a simplified overall status (Pending, Successful, Failed, Not Found).
  - [`getStageProfiling`](./sdks/operation_tracker.md#getstageprofiling): Gets detailed timing and status for all stages of an operation.
  - [`getOperationIdsByShardsKeys`](./sdks/operation_tracker.md#getoperationidsbyshardskeys): Batch fetches Operation IDs by `shardsKey`.
  - [`getStageProfilings`](./sdks/operation_tracker.md#getstageprofilings): Batch fetches stage profiling data.
  - [`getOperationStatuses`](./sdks/operation_tracker.md#getoperationstatuses): Batch fetches current operation statuses.

- **[`Senders`](./sdks/senders.md)**: Handles signing and sending TON transactions.
  - [`SenderAbstraction`](./sdks/senders.md#senderabstraction-interface) (Interface): Defines the contract for senders.
  - [`TonConnectSender`](./sdks/senders.md#tonconnectsender): Implements sending via TonConnect UI.
  - [`RawSender`](./sdks/senders.md#rawsender): Implements sending using a raw private key.
  - [`SenderFactory`](./sdks/senders.md#senderfactory): Utility to easily create `TonConnectSender` or `RawSender`.

- **[`Utilities`](./sdks/utilities.md)**: Helper functions and interfaces.
  - [`startTracking`](./sdks/utilities.md#starttracking): Utility function to poll and log operation status to the console.
  - [`ContractOpener`](./sdks/utilities.md#contractopener-interface) (Interface): Defines how the SDK connects to TON contracts.
  - [Contract Opener Functions](./sdks/utilities.md#contract-opener-functions-orbsopener4-etc): Factories for creating `ContractOpener` instances (e.g., `orbsOpener4`, `liteClientOpener`).

### Data Models

- **[`Enums`](./models/enums.md)**: Key enumerations used by the SDK.
  - [`Network`](./models/enums.md#network): `TESTNET` or `MAINNET`.
  - [`SimplifiedStatuses`](./models/enums.md#simplifiedstatuses): `PENDING`, `FAILED`, `SUCCESSFUL`, `OPERATION_ID_NOT_FOUND`.
  - [`OperationType`](./models/enums.md#operationtype): Detailed operation types (`PENDING`, `TON_TAC_TON`, `ROLLBACK`, etc.).
  - [`StageName`](./models/enums.md#stagename): Identifiers for tracking stages (`COLLECTED_IN_TAC`, `EXECUTED_IN_TAC`, etc.).

- **[`Structs`](./models/structs.md)**: Core data structures.
  - [`AssetBridgingData`](./models/structs.md#assetbridgingdata): Specifies assets to bridge (TON or Jettons).
  - [`EvmProxyMsg`](./models/structs.md#evmproxymsg): Defines the target EVM call details.
  - [`TransactionLinker`](./models/structs.md#transactionlinker): Identifies a cross-chain operation.
  - [`SDKParams`](./models/structs.md#sdkparams): Configuration for `TacSdk.create`.
  - [`TACSimulationRequest`](./models/structs.md#tacsimulationrequest): Input for simulating TAC calls.
  - [`TACSimulationResults`](./models/structs.md#tacsimulationresults): Output from TAC simulation.
  - [`ExecutionStages`](./models/structs.md#executionstages): Detailed profiling data for an operation.
  - [`StatusInfo`](./models/structs.md#statusinfo): Status details for a single stage.
  - *(See file for more...)*

- **[`Interfaces`](./models/interfaces.md)**: TypeScript interfaces defining contracts.
  - [`ContractOpener`](./models/interfaces.md#contractopener): Interface for TON connection handlers.
  - [`SenderAbstraction`](./models/interfaces.md#senderabstraction): Interface for transaction senders.
  - [`WalletInstance`](./models/interfaces.md#walletinstance): Interface required for wallets used by `RawSender`.

- **[`Errors`](./models/errors.md)**: Custom error types.
  - [`ErrorWithStatusCode`](./models/errors.md#errorwithstatuscode): Base error class with an error code.
  - [`ContractError`](./models/errors.md#contracterror), [`FetchError`](./models/errors.md#fetcherror), [`AddressError`](./models/errors.md#addresserror), etc.: Specific error categories.
  - [Pre-defined Instances](./models/errors.md#pre-defined-error-instances): Specific error instances for common issues (e.g., `evmAddressError`, `simulationError`).

Navigate through the linked files for full details on parameters, return types, examples, and more.