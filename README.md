# TAC-SDK

[![Version npm](https://img.shields.io/npm/v/tac-sdk.svg?logo=npm)](https://www.npmjs.com/package/tac-sdk)

**TAC-SDK** is an SDK for facilitating cross-chain transactions from TVM (TON Virtual Machine) to EVM-compatible blockchains. It is designed to simplify cross-chain interactions for EVM developers by enabling transactions from TVM to EVM with minimal configuration.

## Overview

This SDK allows EVM developers to perform cross-chain transactions without needing an in-depth understanding of TON. By specifying the following details, the SDK will generate the necessary transactions:

**For EVM:**
1. The ProxyDapp address to interact with.
2. The method to call on the contract.
3. Any parameters required for the contract method.

**For TVM:**
1. Addresses of TVM Jettons corresponding to EVM tokens.

Using these inputs, the SDK builds a TON transaction payload and enables further signature processing through TON-Connect or directly via mnemonic.

## Features

**TON:**
- Get user jetton balance
- Generate cross-chain transaction payloads and transfer jettons
- Get `operationId` with `transactionLinker` struct
- Track transaction status using `operationId`

## Sharded Messages

Due to the specific architecture of TVM, it’s not possible to send multiple tokens in a single transaction. Therefore, transactions are handled using a sharded messaging system, where each message is linked on the validator side using a unique triplet: `(caller, ShardId, ShardCount)`. This system is particularly useful for complex operations like liquidity providing, where multiple tokens need to be transferred on the TON side.

**Example:**
- **Liquidity Providing:** To add liquidity, two tokens need to be transferred on the TON side. Each token transfer is sent as an individual sharded message, which validators process and link together.

## How to Track the Status of a Transaction

To track a transaction, you first need to obtain its `operationId`. The `operationId` can be retrieved using the `transactionLinker` structure, which is generated within the SDK and returned by the `sendCrossChainTransaction` function. Once you have the `transactionLinker`, call `TransactionStatus.getOperationId(transactionLinker: TransactionLinker)`.

> **Note:** An empty response string indicates that validators have not yet received your messages. Continue making requests until you receive a non-empty `operationId`.

After obtaining the `operationId`, you can check the transaction’s status by using `TransactionStatus.getStatusTransaction(operationId: string)`. The following statuses may be returned:

1. **EVMMerkleMessageCollected:** The validator has collected all events for a single sharded message. For simple transfers (e.g., a token swap), this status indicates that the message is fully gathered.
2. **EVMMerkleRootSet:** The EVM message has been added to the Merkle tree, and subsequent roots will reflect this addition.
3. **EVMMerkleMessageExecuted:** The collected message has been executed on the EVM side.
4. **TVMMerkleMessageCollected:** After execution on EVM, a return message event is generated, which will then be executed on the TVM side.
5. **TVMMerkleRootSet:** The TVM message has been added to the Merkle tree, updating future roots accordingly.
6. **TVMMerkleMessageExecuted:** The TVM Merkle message has been successfully executed on the TVM CrossChainLayer.

Currently, there are no explicit error statuses. If an issue occurs, the transaction will pause at a particular stage. Further error statuses will be added in future versions.

### Terminal State
- **TVMMerkleMessageExecuted**: Indicates that the transaction has completed its full cycle from TVM to EVM and back.


## Install

```bash
npm install tac-sdk
```

## Functionality description
The `TacSdk` class is designed for performing cross-chain operations, particularly bridging Jetton tokens for interaction with the TAC.

---

### Creating an Instance of `TacSdk`

To use the `TacSdk` class, initialize it with the required parameters encapsulated in the `TacSDKTonClientParams` object and then initialize it:

```typescript
import { TacSdk } from 'tac-sdk';
import { Network } from 'tac-sdk';

const tonClientParams: TacSDKTonClientParams = {
  network: Network.Testnet,
  delay: 3,
}; // you can also customize TON client here
const tacSdk = new TacSdk(tonClientParams);
await tacSdk.init();
```

Optionally, you can provide custom client for TON blockchain in `contractOpener` argument to use instead of @ton/ton TonClient:

```typescript
import { TacSdk } from 'tac-sdk';
import { Network } from 'tac-sdk';
import { liteClientOpener } from 'tac-sdk';

// Ex.: your own lite clients for TON
const liteClientServers = [<liteClientServer1>, <liteClientServer1>, ...];

const tonClientParams: TacSDKTonClientParams = {
  network: Network.Testnet,
  contractOpener: await liteClientOpener({ liteservers : liteClientServers }),
};

/* or variant with default liteservers from ton.org:

const tonClientParams: TacSDKTonClientParams = {
  network: Network.Testnet,
  contractOpener: await liteClientOpener({ network: Network.Testnet }),
};

*/

const tacSdk = new TacSdk(tonClientParams);
await tacSdk.init();
```

*ATTENTION:* liteClientOpener uses ton-lite-client lib that does not stop some of its tasks, so process does not stop by itself [https://github.com/ton-core/ton-lite-client/issues/10]. Please, consider to use `process.exit()` in NodeJS environment after all your tasks are completed.

### Function: `sendCrossChainTransaction`

This function facilitates cross-chain transactions by bridging data and assets for interaction with TAC. Works with TON native coin transfer and/or it handles the required logic for burning or transferring jettons based on the Jetton type(wrapped by our s-c CrossChainLayer or not).

---

#### **Purpose**

The `sendCrossChainTransaction` method is the core functionality of the `TacSdk` class, enabling the bridging of assets (or just data) to execute cross-chain operations seamlessly.

---

#### **Parameters**

- **`evmProxyMsg`**: An `EvmProxyMsg` object defining the EVM-specific logic:
  - **`evmTargetAddress`**: Target address on the EVM network.
  - **`methodName`** *(optional)*: Method name to execute on the target contract.
  - **`encodedParameters`** *(optional)*: Encoded parameters for the EVM method.

- **`sender`**: A `SenderAbstraction` object, such as:
  - **`TonConnectSender`**: For TonConnect integration.
  - **`RawSender`**: For raw wallet transactions using a mnemonic.
  
- **`assets`** *(optional)*: An array of `AssetBridgingData` objects, each specifying the Assets details:
  - **`address`** *(optional)*: Address of the Asset.
  - **`amount`**: Amount of Assets to transfer.

> **Note:** If you don't specify assets this will mean sending any data (contract call) to evmTargetAddress.
---

#### **Returns**

- **`Promise<TransactionLinker>`**:
  - A `TransactionLinker` object for tracking the transaction status during cross chain.
---

#### **Functionality**

1. Determines whether each Jetton requires a **burn** or **transfer** operation based on its type.
2. Prepares shard messages and encodes the necessary payloads.
3. Bridges Jettons by sending shard transactions to the appropriate smart contracts.
4. Incorporates EVM logic into the payload for interaction with the TAC.

---

### Getter: `nativeTONAddress`
---
This getter returns address(better to say "indicator") of native TON Coin.

#### **Purpose**

The indicator should only be used in *getEVMTokenAddress* to calculate address of TON wrapper on TAC Chain.

#### **Returns**

- **`string`**:
  - A string that indicates the native TON Coin.

---
### Getter: `nativeTACAddress`
---
This getter returns address of TAC Coin on TAC Chain.

#### **Purpose**

The address could be used in *getTVMTokenAddress* to calculate address of TAC wrapper on TON Chain.

#### **Returns**

- **`Promise<string>`**:
  - A promise that resolves to the computed EVM token address as a string.

---

### Function: `getEVMTokenAddress`
---
This function will get the EVM paired address for a TVM token. 

#### **Purpose**

The ability to compute the EVM address is crucial, in evmProxyMsg you almost always requires the token addresses on the EVM network as parameters. By precomputing the corresponding EVM addresses for TVM tokens, users can ensure that the transaction parameters are correctly configured before executing cross-chain operations.

For example, when adding liquidity, you need to specify the addresses of the tokens on the EVM network that you intend to add. Without the ability to compute these addresses in advance, configuring the transaction would be error-prone and could lead to failures. This function will bridge this gap, making the process seamless and reliable.

#### **Parameters**

- **`tvmTokenAddress(string)`**: The address of the token on the TON blockchain (TVM format), including support for native TON. Address of native TON can be retreieved using *nativeTONAddress* getter in TacSDK.

---

#### **Returns**

- **`Promise<string>`**:
  - A promise that resolves to the computed EVM token address as a string.

---
### Function: `getTVMTokenAddress`
---
This function gets the TVM paired address for a EVM token. 

#### **Purpose**

This function provides the address of the wrapper for any EVM token at a specific address.

#### **Parameters**

- **`evmTokenAddress(string)`**: The address of the token on the TAC blockchain (EVM format), including support for native TAC. Address of native TAC can be retreieved using *nativeTACAddress* getter in TacSDK.

---

#### **Returns**

- **`Promise<string>`**:
  - A promise that resolves to the computed TVM token address as a string.

---

## Sending Transactions: Two Approaches

The SDK provides two approaches for sending transactions: using **TonConnect** or a **raw wallet via mnemonic**. Below is an explanation of both options.

Look at example below or in tests folder(better in tests folder) 
---

### 1. Using TonConnect

The `TonConnectSender` class enables sending transactions via the TonConnect. 
- **Example dirty, better look at uniswap example**:
```typescript
tonConnect: TonConnectUI
const sender = await SenderFactory.getSender({
    tonConnect,
});
```
---

### 2. Using a Raw Wallet via Mnemonic

The `RawSender` class allows direct interaction with the blockchain using a raw wallet created from a mnemonic phrase.

- **Example**:
```typescript
const walletVersion = 'v4';
const mnemonic = process.env.TVM_MNEMONICS || ''; // 24 words mnemonic
const sender = await SenderFactory.getSender({
    version: walletVersion,
    mnemonic,
});
```
---

- **Supported wallet versions**:
```
export type WalletVersion =
    | "v2r1"
    | "v2r2"
    | "v3r1"
    | "v3r2"
    | "v4"
    | "v5r1";
```

## Tracking transaction
The `TransactionStatus` class is designed to track the status of cross-chain transactions by interacting with public or custom Lite Sequencer endpoints. It provides methods to fetch and interpret transaction statuses, enabling smooth monitoring of transaction lifecycles.

---

### Purpose

This class facilitates tracking cross-chain transaction statuses by:
1. Fetching the `operationId` for a transaction using the `transactionLinker` returned from `sendCrossChainTransaction` function in `TacSDK`.
2. Retrieving the current status of a transaction using the `operationId`.
3. Returning a simplified status for easier transaction monitoring.

---

To track a transaction, follow these steps:

---

### 1. Get the `operationId`

Use the `getOperationId(transactionLinker)` method with the `transactionLinker` structure returned from `sendCrossChainTransaction` after sending transaction.

> **Note:** An empty response string indicates that validators have not yet received your messages. Continue retrying until you receive a non-empty `operationId`.


#### **Method: `getOperationId(transactionLinker: TransactionLinker): Promise<string>`**

#### **Parameters**:
  - `transactionLinker`: A `TransactionLinker` object containing transaction linkers.

#### **Returns**:
- **`Promise<string>`**: 
  - A string representing the `operationId`.

#### **Usage**:
  ```typescript
  const tracker = new TransactionStatus();
  const operationId = await tracker.getOperationId(transactionLinker);
  console.log('Operation ID:', operationId);
  ```

---

### 2. Check the Transaction Status

Use the `getStatusTransaction(operationId)` method to fetch the transaction status.

#### **Method: `getStatusTransaction(operationId: string): Promise<string>`**

Retrieves the current status of a transaction using its `operationId`.

#### **Parameters**:
  - `operationId`: The identifier obtained from `getOperationId`.

#### **Returns**:
- **`Promise<string>`**:
  - A string representing the transaction's status, such as:
    - `EVMMerkleMessageCollected`: Validator has collected all events for a single sharded message.
    - `EVMMerkleRootSet`: The EVM message has been added to the Merkle tree.
    - `EVMMerkleMessageExecuted`: The collected message has been executed on the EVM side.
    - `TVMMerkleMessageCollected`: After EVM execution, a return message event is generated for TVM execution.
    - `TVMMerkleRootSet`: The TVM message has been added to the Merkle tree.
    - `TVMMerkleMessageExecuted`: The transaction is fully executed across TVM and EVM.
  (error requests will be processed in future version)
#### **Usage**:
  ```typescript
  const tracker = new TransactionStatus();
  const status = await tracker.getStatusTransaction(operationId);
  console.log('Transaction Status:', status);
  ```

## 3. Use Simplified Status (instead of 1 and 2 steps)

Use the `getSimpifiedTransactionStatus(transactionLinker)` method for an easy-to-interpret status.

---

### Method: `getSimplifiedTransactionStatus(transactionLinker: TransactionLinker, isBridgeOperation: boolean = false): Promise<SimplifiedStatuses>`

Fetches a simplified transaction status using the `transactionLinker`.

#### **Parameters**:
  - `transactionLinker`: A `TransactionLinker` object returned from `sendCrossChainTransaction` function.
  - `isBridgeOperation` *(optional)*: If your operation should only execute on EVM side without returning to TVM set `isBridgeOperation` to **true**. TAC protocol can just bridge the assets.

#### **Returns**:
- **`Promise<SimplifiedStatuses>`**:
  - A simplified status from the `SimplifiedStatuses` enum:
    - **`Pending`**: The transaction is still in progress.
    - **`Successful`**: The transaction has successfully completed.
    - **`OperationIdNotFound`**: The operation ID could not be found.
    - **`Failed`**: The transaction failed.

---

#### **Usage**
Here operationId will be always requested(not optimal).
```typescript
const tracker = new TransactionStatus();
const simplifiedStatus = await tracker.getSimpifiedTransactionStatus(transactionLinker);
console.log('Simplified Status:', simplifiedStatus);
```

## startTracking

---

Track the execution of crosschain operation with `startTracking` method

---

### Method: `async startTracking(transactionLinker: TransactionLinker, isBridgeOperation: boolean = false): Promise<void>`

#### **Parameters**:
  - `transactionLinker`: A `TransactionLinker` object returned from `sendCrossChainTransaction` function.
  - `isBridgeOperation` *(optional)*: If your operation should only execute on EVM side without returning to TVM set `isBridgeOperation` to **true**. TAC protocol can just bridge the assets.

#### **Returns**:
- void:
  - Will stop requesting status once the final status of crosschain operation has been reached.

---

#### **Usage**
Here operationId will be always requested(not optimal).
```typescript
await startTracking(transactionLinker);
```
---

## Structures Description

### `Network (Enum)`
Represents the blockchain network type you want to use.
```typescript
export enum Network {
    Testnet = 'testnet',
    Mainnet = 'mainnet'
}
```

- **`Testnet`**: Represents the testnet ton network.
- **`Mainnet`**: Represents the mainnet ton network.

### `TacSDKTonClientParams (Type)`
```typescript
export type TacSDKTonClientParams = {
    network: Network;
    tonClientParameters?: TonClientParameters;
    delay?: number;
    settingsAddress?: string;
    contractOpener?: ContractOpener;
}
```

Parameters for the TON SDK client.
- **`network`**: Specifies the blockchain network (`Network` type).
- **`tonClientParameters`** *(optional)*: Parameters for configuring the TON client.
- **`delay`** *(optional)*: Delay (in seconds) for requests to the TON client. Default is *0* for custom tonClientParameters, but with empty *tonClientParameters* delay would be set to *3*.
This structure is used to create the TON client, which you will utilize for sending transactions. It allows you to specify the network (Testnet or Mainnet), configure client parameters, and set a delay for request execution. Proper configuration ensures smooth and efficient interaction with the TON blockchain during operations.
- **`settingsAddress`** *(optional)*: TAC protocol contract address. Needed to retrieve protocol data. Set for tests only
- **`contractOpener`** *(optional)*: Client for TON chain to be used instead of @ton/ton TonClient. Used for smart contract interaction.

### `EvmProxyMsg (Type)`
```typescript
export type EvmProxyMsg = {
    evmTargetAddress: string,
    methodName?: string,
    encodedParameters?: string,
}
```
Represents a proxy message to a TAC.
- **`evmTargetAddress`**: Target address on the EVM network.
- **`methodName`** *(optional)*: Method name to be called on the target contract.
- **`encodedParameters`** *(optional)*: Parameters for the method, encoded as a string.

This structure defines the logic you want to execute on the TAC side. This message is sent along with all the sharded messages related to the jetton bridging, enabling the TAC to process the intended logic on the TAC side during the cross-chain transaction.

### `AssetBridgingData (Type)`

This structure is used to specify the details of the Assets you want to bridge for your operation. This allows you to precisely control the tokens and amounts involved in your cross-chain transaction.

```typescript
export type AssetBridgingData = {
  amount: number
  address?: string
}
```

Represents general data for Asset operations.
- **`amount`**: Amount of Assets to be transferred.
- **`address`** *(optional)*: TVM asset's address.

> **Note:** If you need to transfer a native TON coin, do not specify address.

### `TransactionLinker (Type)`
```typescript
export type TransactionLinker = {
    caller: string,
    shardCount: number,
    shardedId: string,
    timestamp: number,
    sendTransactionResult?: unknown,
}
```
Linker to track cross-chain transaction.
- **`caller`**: Address of the transaction initiator.
- **`shardCount`**: Number of shards involved.
- **`shardedId`**: Identifier for the shard.
- **`timestamp`**: Timestamp of the transaction.
- **`sendTransactionResult`** *(optional)*: Result of sending transaction. May be used to check result of sending transaction. Default TonClient does NOT fill this field. However, in unit tests @ton/sandbox set transaction result object to this field.

This structure is designed to help track the entire execution path of a transaction across all levels. By using it, you can identify the `operationId` and subsequently monitor the transaction status through a public API. This is particularly useful for ensuring visibility and transparency in the transaction lifecycle, allowing you to verify its progress and outcome.

### `SimplifiedStatuses (Enum)`
```typescript
export enum SimplifiedStatuses {
    Pending,
    Failed,
    Successful,
    OperationIdNotFound,
}
```
Represents the simplified transaction statuses.
- **`Pending`**: The transaction in progress.
- **`Failed`**: The transaction has failed.
- **`Successful`**: The transaction was executed successfully.
- **`OperationIdNotFound`**: The operation ID was not found.

### `AssetOpType (Enum) internal`
```typescript
export enum AssetOpType {
  JettonBurn = 'JettonBurn',
  JettonTransfer = 'JettonTransfer'
}
```
- **`JettonBurn`**: If the Jetton was wrapped (i.e., originally a token from EVM), then to bridge such Jettons, they will be burned on the TVM side and unlocked on the EVM side.
- **`JettonTransfer`**: If the Jetton originated from TVM, they should be transferred to the TVM smart contract (i.e., locked on TVM side).

### `JettonBurnData (Type) internal`
```typescript
export type JettonBurnData = JettonBridgingData & {
    notificationReceieverAddress: string,
}
```
Extends `JettonBridgingData` with additional fields for burn operations.
- **`notificationReceiverAddress`**: Address to send burn notification(CrossChainLayer s-c address on TVM).

### `ShardMessage (Type) internal`
```typescript
export type ShardMessage = {
    address: string,
    value: number,
    payload: Cell,
}
```
Represent one shard message witin a transaction.
- **`address`**: Address of the message recipient.
- **`value`**: Value (in tokens) sent with the message.
- **`payload`**: Encoded payload (constructed payload for bridging jettons).

### `ShardTransaction (Type) internal`
```typescript
export type ShardTransaction = {
    validUntil: number,
    messages: ShardMessage[],
    network: Network,
}
```

Represents a collected shard messages(for example, for adding liquidity there will be two shard messages: bridging TokenA, bridging TokenB).
- **`validUntil`**: Validity timestamp for the transaction.
- **`messages`**: Array of messages (`ShardMessage` type, bridging multiple tokens).
- **`network`**: Blockchain network (`Network` type).

## Usage

To use this library you need HTTP API endpoint, public endpoints will be used by default:

- **Mainnet**: https://toncenter.com/api/v2/jsonRPC
- **Testnet**: https://testnet.toncenter.com/api/v2/jsonRPC

```typescript
import { TacSdk } from "tac-sdk";
import { TonConnectUI } from "@tonconnect/ui";
import { ethers } from "ethers";

// Create EVM payload for DappProxy
const abi = new ethers.AbiCoder();
const encodedParameters = abi.encode(
  ['uint256', 'uint256', 'address[]', 'address'],
  [
    tokenAAmount,
    tokenBAmount,
    [EVMtokenAAddress, EVMtokenBAddress],
    proxyDapp,
  ]
);
const evmProxyMsg: EvmProxyMsg = {
  evmTargetAddress: DappProxyAddress,
  methodName: 'addLiquidity(uint256,uint256,address[],address)',
  encodedParameters
};

// Create jetton transfer messages corresponding to EVM tokens, e.g., two tokens for adding liquidity to a pool
const assets: AssetBridgingData[] = [
  {
    address: TVMtokenAAddress,
    amount: tokenAAmount
  },
  {
    address: TVMtokenBAddress,
    amount: tokenBAmount
  }
];

const tacSdk = new TacSdk({
  network: Network.Testnet,
  delay: 3,
});
await tacSdk.init();

//Send transaction via tonConnect or mnemonic
const tonConnectUI = new TonConnectUI({
    manifestUrl: config.tonconnectManifestUrl as string
});
const sender = await SenderFactory.getSender({
    tonConnect: tonConnectUI,
});

return await tacSdk.sendCrossChainTransaction(evmProxyMsg, sender, assets);
```
For a detailed example, see `test/sendSwap.ts` or `test/sendRemoveLiquidity.ts`, which demonstrates swapping tokens and removing liquidity on Uniswap and tracking the transaction status.

## License

MIT
