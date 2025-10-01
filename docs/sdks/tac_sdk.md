# TacSdk Class

## Table of Contents

- [TacSdk Class](#tacsdk-class)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Creating an Instance of `TacSdk`](#creating-an-instance-of-tacsdk)
  - [Core Functions](#core-functions)
    - [`sendCrossChainTransaction`](#sendcrosschaintransaction)
    - [`getSimulationInfo`](#getsimulationinfo)
    - [`sendCrossChainTransactions`](#sendcrosschaintransactions)
  - [Asset Helpers](#asset-helpers)
    - [`getAsset`](#getasset)
    - [`getFT`](#getft)
    - [`getNFT`](#getnft)
    - [`getEVMTokenAddress`](#getevmtokenaddress)
    - [`getTVMTokenAddress`](#gettvmtokenaddress)
    - [`nativeTONAddress`](#nativetonaddress)
    - [`nativeTACAddress`](#nativetacaddress)
  - [Executors](#executors)
    - [`getTrustedTACExecutors`](#gettrustedtacexecutors)
    - [`getTrustedTONExecutors`](#gettrustedtonexecutors)
  - [NFT Helpers](#nft-helpers)
    - [`getTVMNFTAddress`](#gettvmnftaddress)
    - [`getEVMNFTAddress`](#getevmnftaddress)
  - [Jetton Helpers](#jetton-helpers)
    - [`getJettonData`](#getjettondata)
    - [`getUserJettonWalletAddress`](#getuserjettonwalletaddress)
    - [`getUserJettonBalance`](#getuserjettonbalance)
    - [`getUserJettonBalanceExtended`](#getuserjettonbalanceextended)
  - [Advanced](#advanced)
    - [`getSmartAccountAddressForTvmWallet`](#getsmartaccountaddressfortvmwallet)
    - [`simulateTACMessage`](#simulatetacmessage)
    - [`simulateTransactions`](#simulatetransactions)
    - [`getTVMExecutorFeeInfo`](#gettvmexecutorfeeinfo)
    - [`bridgeTokensToTON`](#bridgetokenstoton)
    - [`isContractDeployedOnTVM`](#iscontractdeployedontvm)
    - [`getNFTItemData`](#getnftitemdata)
    - [`getOperationTracker`](#getoperationtracker)
    - [`closeConnections`](#closeconnections)

---

## Overview

`TacSdk` is the main interface for working with TAC-TON cross-chain operations. It enables asset bridging, transaction simulation, token mapping, and Jetton utilities.

---

## Creating an Instance of `TacSdk`

```ts
TacSdk.create(sdkParams: SDKParams, logger?: ILogger): Promise<TacSdk>
```

Creates an SDK instance. You can customize TON and TAC params via [`TONParams`](./../models/structs.md#tonparams-type) and [`TACParams`](./../models/structs.md#tacparams-type). The optional `logger` parameter allows you to provide a custom logger instance; if not provided, a no-op logger is used by default.

---

## Core Functions

### `sendCrossChainTransaction`

```ts
sendCrossChainTransaction(
  evmProxyMsg: EvmProxyMsg,
  sender: SenderAbstraction,
  assets: AssetLike[] = [],
  options?: CrossChainTransactionOptions,
): Promise<TransactionLinkerWithOperationId>
```

This function facilitates crosschain operations by bridging data and assets from TON for interaction with TAC. Creates a transaction on the TON side that is sent to the TAC protocol address. This starts the crosschain operation. Works with TON native coin transfer and/or it handles the required logic for burning or transferring jettons based on the Jetton type(wrapped by our s-c CrossChainLayer or not).

#### **Purpose**

The `sendCrossChainTransaction` method is the core functionality of the `TacSdk` class, enabling the bridging of assets (or just data) to execute crosschain operations seamlessly.

#### **Parameters**

- **`evmProxyMsg`**: An [`EvmProxyMsg`](./../models/structs.md#evmproxymsg-type) object defining the EVM-specific logic:
  - **`evmTargetAddress`**: Target address on the EVM network.
  - **`methodName`** *(optional)*: Method name to execute on the target contract. Either method name `MethodName` or signature `MethodName(bytes,bytes)` must be specified (strictly (bytes,bytes)).
  - **`encodedParameters`** *(optional)*: Encoded parameters for the EVM method. You need to specify all arguments except the first one (TACHeader bytes). The TACHeader logic will be specified below

- **`sender`**: A [`SenderAbstraction`](./sender.md) instance, such as:
  - **`TonConnectSender`**: For TonConnect integration.
  - **`RawSender`**: For raw wallet transactions using a mnemonic.
  
- **`assets`**: An array of `AssetLike` instances (defaults to empty array), each specifying the asset to bridge. Can be `Asset` instances created via `AssetFactory.from` or other asset-like objects. Use `withAmount`/`addAmount` to set amounts on `Asset` instances.

- **`options`** *(optional)*: [`CrossChainTransactionOptions`](./../models/structs.md#crosschaintransactionoptions) struct. This includes:
  - **`waitOperationId`** *(optional, default: true)*: Whether to wait for operation ID after sending the transaction
  - **`waitOptions`** *(optional)*: [`WaitOptions`](./operation_tracker.md#waiting-for-results) struct for customizing operation ID waiting behavior

> **Note:** If you specify methodName and encodedParameters and don't specify assets this will mean sending any data (contract call) to evmTargetAddress.

> **Note:** If you don't specify methodName and encodedParameters and specify assets this will mean bridge any assets to evmTargetAddress (be sure to specify assets when doing this).

#### **Returns** [`TransactionLinkerWithOperationId`](./../models/structs.md#transactionlinkerwithoperationid-type)
  - An object for linking TON transaction and crosschain operation as well as for tracking crosschain operation status

#### **Possible exceptions**

- **`InsufficientBalanceError`**: sender has insufficient TON balance to cover fees and transfers.
- **`SimulationError`**: simulation failed on TAC/TON and the SDK aborted sending.
- **`ContractError`**: contract for given jetton is not deployed on TVM side.
- **`AddressError`**: invalid token address provided.

#### **Functionality**

1. Determines whether each Jetton requires a **burn** or **transfer** operation based on its type.
2. Prepares shard messages and encodes the necessary payloads.
3. Simulates the transaction and estimates execution fees. If the simulation fails (e.g., due to gas or logic errors on TAC), the SDK throws an exception with the simulation result and does not send the message.
4. Bridges Jettons by sending shard transactions to the appropriate smart contracts.
5. Incorporates EVM logic into the payload for interaction with the TAC.
---

### `getSimulationInfo`

```ts
getSimulationInfo(
  evmProxyMsg: EvmProxyMsg,
  sender: SenderAbstraction,
  assets?: AssetLike[],
  options?: CrossChainTransactionOptions
): Promise<ExecutionFeeEstimationResult>
```

Simulates the full transaction lifecycle and estimates fees.

**Returns:** [`ExecutionFeeEstimationResult`](./../models/structs.md#executionfeeestimationresult)  
- Provides detailed fee breakdowns and gas estimates.

---

### `sendCrossChainTransactions`

```ts
sendCrossChainTransactions(
  sender: SenderAbstraction, 
  txs: BatchCrossChainTxWithAssetLike[], 
  options?: CrossChainTransactionsOptions
): Promise<TransactionLinkerWithOperationId[]>
```

Sends multiple cross-chain transactions in a batch. This is useful for scenarios where multiple independent operations need to be initiated from TON to TAC.

#### **Parameters**

- **`sender`**: A [`SenderAbstraction`](./sender.md) instance representing the user's wallet.
- **`txs`**: An array of [`BatchCrossChainTxWithAssetLike`](./../models/structs.md#batchcrosschaintxwithassetlike) objects, each defining a single cross-chain transaction with its `evmProxyMsg`, optional `assets`, and optional `options`. 
  > **Note:** Individual transactions in batch operations cannot specify `waitOperationId` or `waitOptions` in their options as these are controlled at the batch level.
- **`options`** *(optional)*: [`CrossChainTransactionsOptions`](./../models/structs.md#crosschaintransactionsoptions) struct controlling batch-level behavior:
  - **`waitOperationIds`** *(optional, default: true)*: Whether to wait for operation IDs for all transactions in the batch
  - **`waitOptions`** *(optional)*: [`WaitOptions`](./operation_tracker.md#waiting-for-results) struct for customizing operation IDs waiting behavior

#### **Returns** `Promise<TransactionLinkerWithOperationId[]>`
  - An array of [`TransactionLinkerWithOperationId`](./../models/structs.md#transactionlinkerwithoperationid-type) objects, one for each transaction sent.

---

## Asset Helpers

### `getAsset`

```ts
getAsset(args: AssetFromFTArg | AssetFromNFTItemArg | AssetFromNFTCollectionArg): Promise<Asset>
getAsset(args: AssetFromFTArg): Promise<FT>
getAsset(args: AssetFromNFTItemArg): Promise<NFT>
getAsset(args: AssetFromNFTCollectionArg): Promise<NFT>
```

Creates an asset wrapper based on the provided arguments. If you pass FT params you get an FT, and for NFT item/collection you get an NFT. Addresses can be TVM or EVM; for EVM addresses the SDK resolves the paired TVM address automatically.

### `getFT`

```ts
getFT(address: TVMAddress | EVMAddress): Promise<FT>
```

Returns a fungible token (Jetton) wrapper by its TVM or EVM address.

### `getNFT`

```ts
getNFT(args: AssetFromNFTItemArg | AssetFromNFTCollectionArg): Promise<NFT>
```

Returns an NFT wrapper created either from an item address or from a collection+index.

### `getEVMTokenAddress`

```ts
getEVMTokenAddress(tvmTokenAddress: string): Promise<string>
```

#### **Purpose**

The ability to compute the EVM address is crucial, in evmProxyMsg you almost always requires the token addresses on the EVM network as parameters. By precomputing the corresponding EVM addresses for TVM tokens, users can ensure that the transaction parameters are correctly configured before executing crosschain operations.

For example, when adding liquidity, you need to specify the addresses of the tokens on the EVM network that you intend to add. Without the ability to compute these addresses in advance, configuring the transaction would be error-prone and could lead to failures. This function will bridge this gap, making the process seamless and reliable.

**Note:** For native TON coin (empty string or nativeTONAddress), this method returns the computed EVM address for the native TON token.

**Note:** The input TVM token address is automatically normalized to the standard EQ form before computing the EVM address.

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
nativeTACAddress(): Promise<string>
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

## NFT Helpers

### `getTVMNFTAddress`

```ts
getTVMNFTAddress(evmNFTAddress: string, tokenId?: number | bigint): Promise<string>
```

Returns the corresponding TVM NFT address (either the collection wrapper or a specific item wrapper) for a given EVM NFT address.

#### **Parameters**

- **`evmNFTAddress`**: The address of the NFT collection on the EVM (TAC) chain.
- **`tokenId`** *(optional)*: The specific token ID within the EVM collection. Can be either a `number` or `bigint`. If provided, the function returns the address of the corresponding TVM NFT item wrapper. If omitted, it returns the address of the TVM NFT collection.

#### **Returns**

Returns the calculated TVM NFT address as a string.

---

### `getEVMNFTAddress`

```ts
getEVMNFTAddress(tvmNFTAddress: string, addressType: NFTAddressType): Promise<string>
```

Returns the corresponding EVM NFT address for a given TVM NFT address (which can be either a collection wrapper or an item wrapper).

#### **Parameters**

- **`tvmNFTAddress`**: The address of the NFT on the TVM (TON) chain (can be a collection or item wrapper).
- **`addressType`**: An enum [`NFTAddressType`](./../models/enums.md#nftaddresstype) indicating whether the provided `tvmNFTAddress` refers to a collection (`NFTAddressType.COLLECTION`) or a specific item (`NFTAddressType.ITEM`).

#### **Returns**

Returns the EVM NFT collection address as a string.

---

## Jetton Helpers

### `getJettonData`

```ts
getJettonData(itemAddress: TVMAddress): Promise<JettonMinterData>
```

Returns Jetton minter contract data (metadata, total supply, mintable flag, etc.) by its TVM address.

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

#### **Returns** [`UserWalletBalanceExtended`](./../models/structs.md#userwalletbalanceextended)
  - An object with extended user balance data.

---

## Advanced

### `getSmartAccountAddressForTvmWallet`

```ts
getSmartAccountAddressForTvmWallet(tvmWallet: string, applicationAddress: string): Promise<string>
```

Get Smart Account address for specified TVM Wallet for specified application

### `simulateTACMessage`

```ts
simulateTACMessage(req: TACSimulationParams): Promise<TACSimulationResult>
```

Simulates EVM-side contract call with a TAC header and TON asset context.

#### **Parameters**

- **`req`**: A [`TACSimulationParams`](./../models/structs.md#tacsimulationparams) object containing all the necessary parameters for the simulation.

#### **Returns** [`TACSimulationResult`](./../models/structs.md#tacsimulationresult)
  - Simulation result on TAC.

---

### `simulateTransactions`

```ts
simulateTransactions(sender: SenderAbstraction, txs: CrosschainTx[]): Promise<ExecutionFeeEstimationResult[]>
```

Simulates multiple cross-chain transactions in batch, providing the same convenient interface as `sendCrossChainTransactions` but for simulation purposes only. This method is useful for testing and fee estimation of multiple transactions without actually sending them.

#### **Returns** [`ExecutionFeeEstimationResult[]`](./../models/structs.md#executionfeeestimationresult)
  - Array of execution fee estimation results, one for each input transaction.

---

### `getTVMExecutorFeeInfo`
```ts
  getTVMExecutorFeeInfo(
    assets: AssetLike[],
    feeSymbol: string,
    tvmValidExecutors?: string[]
  ): Promise<SuggestedTVMExecutorFee>
```

Calculates the TVM executor fee for bridging `assets` to TON. The `feeSymbol` determines the token used to pay the fee — TAC for direct TAC->TON operations, or TON for TON->TAC->TON messages. Optionally, you can pass `tvmValidExecutors` to restrict the set of trusted TON executors used for estimation.

Note: The TON executor fee is determined as max(rollback_message, normal_execution) to account for the worst-case path.

#### **Returns** [`SuggestedTVMExecutorFee`](./../models/structs.md#suggestedtvmexecutorfee)
  - Estimated tvmExecutorFee in both TAC and TON.

---

### `bridgeTokensToTON`

```ts
bridgeTokensToTON(
  signer: Wallet, 
  value: bigint, 
  tonTarget: string, 
  assets?: AssetLike[],
  tvmExecutorFee?: bigint,
  tvmValidExecutors?: string[]
): Promise<string>
```

Initiates a bridge operation from TAC back to TON. This function handles the necessary approvals and sends a message to the CrossChainLayer contract on TAC to transfer native TAC coin and/or specified assets (Tokens/NFTs) to a target address on TON.

**Note:** This function requires an `ethers.Wallet` instance connected to the TAC network to sign the transaction.

#### **Parameters**

- **`signer`**: An `ethers.Wallet` instance for signing the transaction on the TAC chain.
- **`value`**: The amount of native TAC coin (in wei) to bridge.
- **`tonTarget`**: The target address on the TON network where the assets should be received.
- **`assets`** *(optional)*: An array of `AssetLike` objects specifying the tokens or NFTs to bridge. Can be [`Asset`](./assets.md#asset-interface) instances or other asset-like objects.
- **`tvmExecutorFee`** *(optional)*: The fee (in TON) to pay the TVM executor for processing the message on the TON side. If not provided, a suggested fee is calculated.
- **`tvmValidExecutors`** *(optional)*: Array of trusted TON executor addresses to restrict the set of executors used for estimation and execution on TVM.

#### **Returns** `Promise<string>`
  - The transaction hash of the bridging transaction submitted on the TAC chain.

---

### `isContractDeployedOnTVM`

```ts
isContractDeployedOnTVM(address: string): Promise<boolean>
```

#### **Purpose**
Checks if a contract is deployed and active on the TVM chain.

#### **Parameters**
- **`address`**: The contract address to check on TVM chain.

#### **Returns**
`Promise<boolean>`
- Returns `true` if the contract is active, `false` otherwise.

### `getNFTItemData`

```ts
getNFTItemData(itemAddress: string): Promise<NFTItemData>
```

#### **Purpose**
Retrieves NFT data from the TVM chain for a given NFT item address.

#### **Parameters**
- **`itemAddress`**: The address of the NFT item on TVM chain.

#### **Returns**
[`Promise<NFTItemData>`](./../models/structs.md#nftitemdata)
- Returns the NFT data including collection, owner, and metadata information.

#### **Possible exceptions**
- **`AddressError`**: If the provided address is invalid.

---

### `getOperationTracker`

```ts
getOperationTracker(): IOperationTracker
```

#### **Purpose**
Returns the operation tracker instance used for querying operation statuses and utilities.

#### **Returns**
[`IOperationTracker`](./operation_tracker.md)
- The operation tracker instance for monitoring cross-chain operation status and getting detailed execution information.

---

### `closeConnections`

```ts
closeConnections(): unknown
```

Closes underlying TON and TAC connections.