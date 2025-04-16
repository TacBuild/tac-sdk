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

Initiates a crosschain transaction from TON to TAC.

**Returns:** `TransactionLinker`  
Structure that links the TON transaction to its EVM-side execution. Useful for tracking and post-processing.

**Interfaces Used:**

- **EvmProxyMsg**: defines the EVM destination and method.
- **SenderAbstraction**: abstract class for sending transactions.
- **AssetBridgingData**: structure containing asset address, amount, decimals.
- **CrossChainTransactionOptions**: extra flags like executor fees and forceSend.

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

Returns the EVM counterpart for a given TVM token address.

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