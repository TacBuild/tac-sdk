# TacSdk Class

## Table of Contents

- [Overview](#overview)
- [Creating an Instance of `TacSdk`](#creating-an-instance-of-tacsdk)
- [Core Functions](#core-functions)
  - [`sendCrossChainTransaction`](#sendcrosschaintransaction)
  - [`getTransactionSimulationInfo`](#gettransactionsimulationinfo)
- [Token Address Helpers](#token-address-helpers)
  - [`getEVMTokenAddress`](#getevmtokenaddress)
  - [`getTVMTokenAddress`](#gettvmtokenaddress)
  - [`nativeTONAddress`](#nativetonaddress)
  - [`nativeTACAddress`](#nativetacaddress)
- [Executors](#executors)
  - [`getTrustedTACExecutors`](#gettrustedtacexecutors)
  - [`getTrustedTONExecutors`](#gettrustedtonexecutors)
- [Jetton Helpers](#jetton-helpers)
  - [`getUserJettonWalletAddress`](#getuserjettonwalletaddress)
  - [`getUserJettonBalance`](#getuserjettonbalance)
  - [`getUserJettonBalanceExtended`](#getuserjettonbalanceextended)
- [Advanced](#advanced)
  - [`simulateTACMessage`](#simulatetacmessage)
  - [`closeConnections`](#closeconnections)

---

## Overview

`TacSdk` is the main interface for working with TAC-TON cross-chain operations. It enables asset bridging, transaction simulation, token mapping, and Jetton utilities.

---

## Creating an Instance of `TacSdk`

```ts
TacSdk.create(sdkParams: SDKParams): Promise<TacSdk>
```

Creates an SDK instance. You can customize TON and TAC params via `TONParams` and `TACParams`.

---

## Core Functions

### `sendCrossChainTransaction`

```ts
sendCrossChainTransaction(
  evmProxyMsg: EvmProxyMsg,
  sender: SenderAbstraction,
  assets?: AssetBridgingData[],
  options?: CrossChainTransactionOptions
): Promise<TransactionLinker>
```

This function facilitates crosschain operations by bridging data and assets from TON for interaction with TAC. Creates a transaction on the TON side that is sent to the TAC protocol address. This starts the crosschain operation. Works with TON native coin transfer and/or it handles the required logic for burning or transferring jettons based on the Jetton type(wrapped by our s-c CrossChainLayer or not).

#### **Purpose**

The `sendCrossChainTransaction` method is the core functionality of the `TacSdk` class, enabling the bridging of assets (or just data) to execute crosschain operations seamlessly.

#### **Parameters**

- **`evmProxyMsg`**: An `EvmProxyMsg` object defining the EVM-specific logic:
  - **`evmTargetAddress`**: Target address on the EVM network.
  - **`methodName`** *(optional)*: Method name to execute on the target contract. Either method name `MethodName` or signature `MethodName(bytes,bytes)` must be specified (strictly (bytes,bytes)).
  - **`encodedParameters`** *(optional)*: Encoded parameters for the EVM method. You need to specify all arguments except the first one (TACHeader bytes). The TACHeader logic will be specified below

- **`sender`**: A `SenderAbstraction` object, such as:
  - **`TonConnectSender`**: For TonConnect integration.
  - **`RawSender`**: For raw wallet transactions using a mnemonic.
  
- **`assets`** *(optional)*: An array of `AssetBridgingData` objects, each specifying the Assets details:
  - **`address`** *(optional)*: Address of the Asset.
  - **`rawAmount`** *(required if `amount` is not specified): Amount of Assets to be transferred taking into account the number of decimals.
  - **`amount`** *(required if `rawAmount` is not specified): Amount of Assets to be transferred.
  - **`decimals`** *(optional)*: Number of decimals for the asset. If not specified, the SDK will attempt to extract the decimals from the chain.

- **`options`** *(optional)*: `CrossChainTransactionOptions` struct. 

> **Note:** If you specify methodName and encodedParameters and don't specify assets this will mean sending any data (contract call) to evmTargetAddress.

> **Note:** If you don't specify methodName and encodedParameters and specify assets this will mean bridge any assets to evmTargetAddress (be sure to specify assets when doing this).

#### **Returns**

- **`Promise<TransactionLinker>`**:
  - A `TransactionLinker` object for linking TON transaction and crosschain operation as well as for tracking crosschain operation status

#### **Possible exceptions**

- **`ContractError`**: contract for given jetton is not deployed on TVM side.
- **`AddressError`**: invalid token address provided.

#### **Functionality**

1. Determines whether each Jetton requires a **burn** or **transfer** operation based on its type.
2. Prepares shard messages and encodes the necessary payloads.
3. Simulates the transaction and estimates execution fees. If the simulation fails (e.g., due to gas or logic errors on TAC), the SDK throws an exception with the simulation result and does not send the message.
4. Bridges Jettons by sending shard transactions to the appropriate smart contracts.
5. Incorporates EVM logic into the payload for interaction with the TAC.
---

### `getTransactionSimulationInfo`

```ts
getTransactionSimulationInfo(
  evmProxyMsg: EvmProxyMsg,
  sender: SenderAbstraction,
  assets?: AssetBridgingData[]
): Promise<ExecutionFeeEstimationResult>
```

Simulates the full transaction lifecycle and estimates fees.

**Returns:** `ExecutionFeeEstimationResult`  
Provides detailed fee breakdowns and gas estimates.

---

## Token Address Helpers

### `getEVMTokenAddress`

```ts
getEVMTokenAddress(tvmTokenAddress: string): Promise<string>
```

#### **Purpose**

The ability to compute the EVM address is crucial, in evmProxyMsg you almost always requires the token addresses on the EVM network as parameters. By precomputing the corresponding EVM addresses for TVM tokens, users can ensure that the transaction parameters are correctly configured before executing crosschain operations.

For example, when adding liquidity, you need to specify the addresses of the tokens on the EVM network that you intend to add. Without the ability to compute these addresses in advance, configuring the transaction would be error-prone and could lead to failures. This function will bridge this gap, making the process seamless and reliable.

#### **Returns**

Returns the EVM paired address for a given TVM token address.

---

### `getTVMTokenAddress`

```ts
getTVMTokenAddress(evmTokenAddress: string): Promise<string>
```

Returns the TVM wrapper address for a given EVM token.

---

### `nativeTONAddress`

```ts
get nativeTONAddress(): string
```

Returns a symbolic identifier for native TON.

---

### `nativeTACAddress`

```ts
get nativeTACAddress(): Promise<string>
```

Returns the address of native TAC coin on the TAC chain.

---

## Executors

### `getTrustedTACExecutors`

```ts
get getTrustedTACExecutors(): string[]
```

Returns trusted EVM executor addresses.

---

### `getTrustedTONExecutors`

```ts
get getTrustedTONExecutors(): string[]
```

Returns trusted TON executor addresses.

---

## Jetton Helpers

### `getUserJettonWalletAddress`

```ts
getUserJettonWalletAddress(userAddress: string, tokenAddress: string): Promise<string>
```

Returns the address of the user’s Jetton wallet.

---

### `getUserJettonBalance`

```ts
getUserJettonBalance(userAddress: string, tokenAddress: string): Promise<bigint>
```

Returns Jetton balance in raw `bigint` format.

---

### `getUserJettonBalanceExtended`

```ts
getUserJettonBalanceExtended(userAddress: string, tokenAddress: string): Promise<UserWalletBalanceExtended>
```

Returns:

**Structure: `UserWalletBalanceExtended`**
```ts
type UserWalletBalanceExtended =
  | {
      exists: true;
      rawAmount: bigint;
      decimals: number;
      amount: number;
    }
  | {
      exists: false;
    };
```

---

## Advanced

### `simulateTACMessage`

```ts
simulateTACMessage(
  tacCallParams: {
    target: string;
    methodName: string;
    arguments: string;
  },
  extraData: string,
  feeAssetAddress: string,
  shardedId: number,
  tonAssets: { tokenAddress: string; amount: bigint }[],
  tonCaller: string
): Promise<TACSimulationResult>
```

Simulates EVM-side contract call with a TAC header and TON asset context.

---

### `closeConnections`

```ts
closeConnections(): void
```

Closes underlying TON and TAC connections.