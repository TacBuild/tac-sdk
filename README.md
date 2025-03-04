# TAC-SDK

[![Version npm](https://img.shields.io/npm/v/@tonappchain/sdk.svg?logo=npm)](https://www.npmjs.com/package/@tonappchain/sdk)

**TAC-SDK** is an SDK for facilitating crosschain operations from TVM (TON Virtual Machine) to EVM-compatible blockchains. It is designed to simplify crosschain interactions for EVM developers by enabling transactions from TVM to EVM with minimal configuration.

## Overview

This SDK allows EVM developers to perform crosschain operations without needing an in-depth understanding of TON. By specifying the following details, the SDK will generate the necessary transactions:

**For EVM:**
1. The ProxyDapp address to interact with.
2. The method to call on the contract.
3. Any encoded parameters required for the contract method.

**For TVM:**
1. Addresses of TVM Jettons corresponding to EVM tokens.

Using these inputs, the SDK builds a TON transaction payload and enables further signature processing through TON-Connect or directly via mnemonic.

---

## Features

**TON:**
- Get user jetton balance
- Generate TON transaction payloads for crosschain operations and transfer jettons
- Get `operationId` with `transactionLinker` struct
- Track operation status using `operationId`

---

## Sharded Messages

Due to the specific architecture of TVM, it’s not possible to send multiple tokens in a single transaction. Therefore, transactions are handled using a sharded messaging system, where each message is linked on the validator side using a unique triplet: `(caller, ShardsKey, ShardCount)`. This system is particularly useful for complex operations like liquidity providing, where multiple tokens need to be transferred on the TON side.

**Example:**
- **Liquidity Providing:** To add liquidity, two tokens need to be transferred on the TON side. Each token transfer is sent as an individual sharded message, which validators process and link together.

---

## How to Track the Status of an Operation

To track an operation, you first need to obtain its `operationId`. The `operationId` can be retrieved using the `transactionLinker` structure, which is generated within the SDK and returned by the `sendCrossChainTransaction` function. Once you have the `transactionLinker`, call `OperationTracker.getOperationId(transactionLinker: TransactionLinker)`.

> **Note:** An empty response string indicates that validators have not yet received your messages. Continue making requests until you receive a non-empty `operationId`.

After obtaining the `operationId`, you can check the operation’s status by using `OperationTracker.getOperationStatus(operationId: string)`. The following statuses may be returned:

1. **EVMMerkleMessageCollected:** The validator has collected all events for a single sharded message. For simple transfers (e.g., a token swap), this status indicates that the message is fully gathered.
2. **EVMMerkleRootSet:** The EVM message has been added to the Merkle tree, and subsequent roots will reflect this addition.
3. **EVMMerkleMessageExecuted:** The collected message has been executed on the EVM side.
4. **TVMMerkleMessageCollected:** After execution on EVM, a return message event is generated, which will then be executed on the TVM side.
5. **TVMMerkleRootSet:** The TVM message has been added to the Merkle tree, updating future roots accordingly.
6. **TVMMerkleMessageExecuted:** The TVM Merkle message has been successfully executed on the TVM CrossChainLayer.

If an issue occurs, the error message will also be included in response.

### Terminal State
- **TVMMerkleMessageExecuted**: Indicates that the operation has completed its full cycle from TVM to EVM and back.

---

## Install

```bash
npm install @tonappchain/sdk
```

---

## Functionality description
The `TacSdk` class is designed for performing crosschain operations, particularly bridging Jetton tokens for interaction with the TAC.

### Creating an Instance of `TacSdk`

To use the `TacSdk` class, create it with the required parameters encapsulated in the `SDKParams` object (you can also specify custom params for TAC and TON by `TACParams` and `TONParams`): 

```typescript
import { TacSdk } from '@tonappchain/sdk';
import { Network } from '@tonappchain/sdk';

const sdkParams: SDKParams = {
  network: Network.Testnet
  // you can also customize TAC and TON params here
}; 
const tacSdk = await TacSdk.create(sdkParams);
```
> **Note:** By default Orbs Network is used as TON provider 

Optionally, only in NodeJS you can provide custom liteservers client for TON blockchain in `contractOpener` argument:

```typescript
import { TacSdk, Network, liteClientOpener } from '@tonappchain/sdk';

// Ex.: your own lite clients for TON
const liteClientServers = [<liteClientServer1>, <liteClientServer1>, ...];

const sdkParams: SDKParams = {
  network: Network.Testnet,
  TONParams: {
    contractOpener: await liteClientOpener({ liteservers : liteClientServers }),
  },
};

const tacSdk = await TacSdk.create(sdkParams);
```

*ATTENTION:* don't forget to close the connections after all the work is done, otherwise the script will hang:

```typescript
tacSdk.closeConnections();
```

Optionally, you can provide @ton/ton TonClient (public endpoints will be used by default):

- **Mainnet**: https://toncenter.com/api/v2/jsonRPC
- **Testnet**: https://testnet.toncenter.com/api/v2/jsonRPC

```typescript
import { TacSdk, Network } from '@tonappchain/sdk';
import { TonClient } from '@ton/ton';

const sdk = await TacSdk.create({
  network: Network.Testnet,
  delay: 1,
  TONParams: {
    contractOpener: new TonClient({
      endpoint: "https://testnet.toncenter.com/api/v2/jsonRPC",
      // apiKey: "your_api_key"
    })
  }
});

const tacSdk = await TacSdk.create(sdkParams);
```

#### Possible exceptions

- **`SettingError`**: settings contract at provided address does not contain required setting key.

---

### Function: `closeConnections`

This function stops all connections to the network, such as Ton Liteservers, and should be called after all operations are completed. Can be used if you use custom contract opener and need to close connections manually.

### Function: `sendCrossChainTransaction`

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
3. Bridges Jettons by sending shard transactions to the appropriate smart contracts.
4. Incorporates EVM logic into the payload for interaction with the TAC.

---
### TACHeader 
> **Note:** The TAC protocol only knows how to send data to contracts that inherit from a TacProxy (TacProxyV1) contract. Such a contract must have a strictly defined signature of its methods. It is specified below:

```
function myProxyFunction(bytes calldata tacHeader, bytes calldata arguments) external onlyTacCCL {
  // Function implementation 
}
```

> **Note:** methodName in `evmProxyMsg` must be either a simple method name or a signature of the form MethodName(bytes,bytes)

The first argument of methods must always be TACHeader. It is sent by protocol, augmented with data from executor.
- **`bytes tacHeader`**: Encoded structure TacHeaderV1, containing:
  - **`uint64 shardsKey`**: ID you can specify for yourself an inside message to the TVM contract on the TON network. 
  - **`uint256 timestamp`**: The block timestamp on TON where the user's message was created. 
  - **`bytes32 operationId`**: Unique identifier for the message created by the TAC infrastructure. 
  - **`string tvmCaller`**: The TON user's wallet address that sent the message. 
  - **`bytes extraData`**: Untrusted extra data, provided by executor with the current message if needed. Otherwise, it's an empty bytes array.

You need to specify all the remaining data you need in tuple (bytes) in arguments. For example this is how arguments for addLiquidity method in UniswapV2 (a special proxy contract for it) will look like:

```
    const abi = new ethers.AbiCoder();
    const encodedParameters = abi.encode(
        ['tuple(address,address,uint256,uint256,uint256,uint256,address,uint256)'],
        [
            [
                EVM_TOKEN_A_ADDRESS,
                EVM_TOKEN_B_ADDRESS,
                amountA,
                amountB,
                amountAMin, 
                amountBMin,  
                UNISWAPV2_PROXY_ADDRESS, 
                deadline 
            ]
        ]
    );
```
More details in [sendAddLiquidity.ts](tests/uniswap_v2/sendAddLiquidity.ts) and in other tests.

---

### Getter: `nativeTONAddress`

This getter returns address(better to say "indicator") of native TON Coin.

#### **Purpose**

The indicator should only be used in *getEVMTokenAddress* to calculate address of TON wrapper on TAC Chain.

#### **Returns**

- **`string`**:
  - A string that indicates the native TON Coin.


### Getter: `nativeTACAddress`

This getter returns address of TAC Coin on TAC Chain.

#### **Purpose**

The address could be used in *getTVMTokenAddress* to calculate address of TAC wrapper on TON Chain.

#### **Returns**

- **`Promise<string>`**:
  - A promise that resolves to the computed EVM token address as a string.


### Function: `getEVMTokenAddress`

This function will get the EVM paired address for a TVM token. 

#### **Purpose**

The ability to compute the EVM address is crucial, in evmProxyMsg you almost always requires the token addresses on the EVM network as parameters. By precomputing the corresponding EVM addresses for TVM tokens, users can ensure that the transaction parameters are correctly configured before executing crosschain operations.

For example, when adding liquidity, you need to specify the addresses of the tokens on the EVM network that you intend to add. Without the ability to compute these addresses in advance, configuring the transaction would be error-prone and could lead to failures. This function will bridge this gap, making the process seamless and reliable.

#### **Parameters**

- **`tvmTokenAddress(string)`**: The address of the token on the TON blockchain (TVM format), including support for native TON. Address of native TON can be retreieved using *nativeTONAddress* getter in TacSDK.

#### **Returns**

- **`Promise<string>`**:
  - A promise that resolves to the computed EVM token address as a string.

#### **Possible exceptions**

- **`AddressError`**: invalid token address provided.


### Function: `getTVMTokenAddress`

This function gets the TVM paired address for a EVM token. 

#### **Purpose**

This function provides the address of the wrapper for any EVM token at a specific address.

#### **Parameters**

- **`evmTokenAddress(string)`**: The address of the token on the TAC blockchain (EVM format), including support for native TAC. Address of native TAC can be retreieved using *nativeTACAddress* getter in TacSDK.

#### **Returns**

- **`Promise<string>`**:
  - A promise that resolves to the computed TVM token address as a string.

#### **Possible exceptions**

- **`AddressError`**: invalid token address provided.


### Function: `getUserJettonWalletAddress`

This function retrieves the address of a user's Jetton wallet for a specific token.

#### **Purpose**

This function is useful for obtaining the address of a user's Jetton wallet, which is necessary for interacting with Jetton tokens on the TON blockchain.

#### **Parameters**

- **`userAddress(string)`**: The address of the user's wallet on the TON blockchain.
- **`tokenAddress(string)`**: The address of the Jetton token.

#### **Returns**

- **`Promise<string>`**:
  - A promise that resolves to the address of the user's Jetton wallet as a string.

#### **Possible exceptions**

- **`AddressError`**: invalid token address provided.


### Function: `getUserJettonBalance`

This function retrieves the balance of a specific Jetton token in a user's wallet.

#### **Purpose**

This function allows users to check their balance of a specific Jetton token, which is essential for managing assets on the TON blockchain.

#### **Parameters**

- **`userAddress(string)`**: The address of the user's wallet on the TON blockchain.
- **`tokenAddress(string)`**: The address of the Jetton token.

#### **Returns**

- **`Promise<bigint>`**:
  - A promise that resolves to the balance of the Jetton token in the user's wallet as a `bigint`.

#### **Possible exceptions**

- **`AddressError`**: invalid token address provided.


### Function: `getUserJettonBalanceExtended`

This function retrieves detailed information about a user's Jetton balance, including the raw amount, decimals, and formatted amount.

#### **Purpose**

This function provides a more detailed view of a user's Jetton balance, including the raw amount, the number of decimals, and the formatted amount, which is useful for displaying balances in a user-friendly format.

#### **Parameters**

- **`userAddress(string)`**: The address of the user's wallet on the TON blockchain.
- **`tokenAddress(string)`**: The address of the Jetton token.

#### **Returns**

- **`Promise<UserWalletBalanceExtended>`**:
  - A promise that resolves to an object with one of the following structures:
    - If the Jetton wallet exists:
      - **`exists`**: A boolean indicating whether the Jetton wallet exists (`true`).
      - **`rawAmount`**: The raw balance of the Jetton token as a `bigint`.
      - **`decimals`**: The number of decimals for the Jetton token.
      - **`amount`**: The formatted balance of the Jetton token as a number.
    - If the Jetton wallet does not exist:
      - **`exists`**: A boolean indicating whether the Jetton wallet exists (`false`).
#### **Possible exceptions**

- **`AddressError`**: invalid token address provided.


### Function: `simulateEVMMessage`

This function will simulate the EVM message on the TAC side.

#### **Purpose**

The ability to simulate the EVM message is crucial for testing and debugging crosschain operations. By simulating the message, developers can verify that the transaction parameters are correctly configured and that the operation will execute.

#### **Parameters**

- **`evmCallParams`**: An object defining the EVM-specific logic:
  - **`target`**: Target address on the EVM network.
  - **`methodName`**: Method name to execute on the target contract. Either method name `MethodName` or signature `MethodName(bytes,bytes)` must be specified (strictly (bytes,bytes)).
  - **`arguments`**: Encoded parameters for the EVM method.
- **`extraData`**: Unstrusted Extra Data provided by executor.
- **`feeAssetAddress`**: TVM Fee Asset Address, empty string for native TON.
- **`shardedId`**: Sharded ID.
- **`tvmAssets`**: An array of objects, each specifying the Assets details:
  - **`tokenAddress`**: Address of the Asset.
  - **`amount`**: Amount of Assets to be transferred.
- **`tvmCaller`**: TVM Caller wallet address.

#### **Returns**

- **`Promise<EVMSimulationResults>`**:
  - A promise that resolves to detailed information about the execution of the given message, including:
    - **`estimatedGas`**: The estimated gas required for the message.
    - **`estimatedJettonFeeAmount`**: The estimated fee amount in Jettons.
    - **`feeParams`**: The parameters related to the fee.
      - **`currentBaseFee`**: The current base fee.
      - **`isEip1559`**: Indicates if EIP-1559 is applied.
      - **`suggestedGasPrice`**: The suggested gas price.
      - **`suggestedGasTip`**: The suggested gas tip.
    - **`message`**: The message details.
    - **`outMessages`**: The outgoing messages.
      - **`callerAddress`**: The address of the caller.
      - **`operationId`**: The operation ID.
      - **`payload`**: The payload.
      - **`queryId`**: The query ID.
      - **`targetAddress`**: The target address.
      - **`tokensBurned`**: The tokens burned.
        - **`amount`**: The amount of tokens burned.
        - **`tokenAddress`**: The address of the token.
      - **`tokensLocked`**: The tokens locked.
    - **`simulationError`**: Any error encountered during the simulation.
    - **`simulationStatus`**: The status of the simulation.
    - **`debugInfo`**: Debugging information.
      - **`from`**: The sender address.
      - **`to`**: The recipient address.
      - **`callData`**: The call data.
      - **`blockNumber`**: The block number.

---

## Sending TON Transactions: Two Approaches

The SDK provides two approaches for sending TON transactions: using **TonConnect** or a **raw wallet via mnemonic**. Below is an explanation of both options.

Look at example below or in tests folder(better in tests folder) 


### 1. Using TonConnect

The `TonConnectSender` class enables sending transactions via the TonConnect. 
- **Example dirty, better look at uniswap example**:
```typescript
tonConnect: TonConnectUI
const sender = await SenderFactory.getSender({
    tonConnect,
});
```

### 2. Using a Raw Wallet via Mnemonic

The `RawSender` class allows direct interaction with the blockchain using a raw wallet created from a mnemonic phrase.

- **Example**:
```typescript
const walletVersion = 'v4';
const mnemonic = process.env.TVM_MNEMONICS || ''; // 24 words mnemonic
const network = Network.Testnet; // or Network.Mainnet
const sender = await SenderFactory.getSender({
    version: walletVersion,
    mnemonic,
    network,
});
```

- **Supported wallet versions**:
```
export type WalletVersion =
    | "v2r1"
    | "v2r2"
    | "v3r1"
    | "v3r2"
    | "v4"
    | "v5r1"
    | "highloadV3";
```

- **Possible exceptions**:
  - **`WalletError`**: invalid wallet version provided.

---

## Tracking operation
The `OperationTracker` class is designed to track the status of crosschain operations by interacting with public or custom Lite Sequencer endpoints. It provides methods to fetch and interpret transaction statuses, enabling smooth monitoring of transaction lifecycles.

### Purpose

This class facilitates tracking crosschain operation statuses by:
1. Fetching the `operationId` for a TON transaction using the `transactionLinker` returned from `sendCrossChainTransaction` function in `TacSDK`.
2. Retrieving the current status of an operation using the `operationId`.
3. Returning a simplified status for easier operation monitoring.

To track an operation, follow these steps:

### 0. Create an Instance of OperationTracker

To use the `OperationTracker` class, initialize it with the required parameters (you can specify `customLiteSequencerEndpoints` for sending requests there):

```typescript
import { OperationTracker, Network } from '@tonappchain/sdk';

const tracker = new OperationTracker(
  network: Network.Testnet,
  // customLiteSequencerEndpoints: ["custom.com"]
);
```

### 1. Get the `operationId`

Use the `getOperationId(transactionLinker)` method with the `transactionLinker` structure returned from `sendCrossChainTransaction` after sending TON transaction.

> **Note:** An empty response string indicates that validators have not yet received your messages. Continue retrying until you receive a non-empty `operationId`.


#### **Method: `getOperationId(transactionLinker: TransactionLinker): Promise<string>`**

#### **Parameters**:
  - `transactionLinker`: A `TransactionLinker` object containing TON transaction linkers.

#### **Returns**:
- **`Promise<string>`**: 
  - A string representing the `operationId`.

#### **Usage**:
  ```typescript
  const tracker = new OperationTracker(
        network: Network.Testnet
  );
  const operationId = await tracker.getOperationId(transactionLinker);
  console.log('Operation ID:', operationId);
  ```

### 2. Check the Operation Status

Use the `getOperationStatus(operationId)` method to fetch the operation status.

#### **Method: `getOperationStatus(operationId: string): Promise<StatusInfo>`**

Retrieves the current status of an operation using its `operationId`.

#### **Parameters**:
  - `operationId`: The identifier obtained from `getOperationId`.

#### **Returns**:
- **`Promise<StatusInfo>`**:
  - A structure representing the operation's status, including:
    - `status`:
      - `EVMMerkleMessageCollected`: Validator has collected all events for a single sharded message.
      - `EVMMerkleRootSet`: The EVM message has been added to the Merkle tree.
      - `EVMMerkleMessageExecuted`: The collected message has been executed on the EVM side.
      - `TVMMerkleMessageCollected`: After EVM execution, a return message event is generated for TVM execution.
      - `TVMMerkleRootSet`: The TVM message has been added to the Merkle tree.
      - `TVMMerkleMessageExecuted`: The operation is fully executed across TVM and EVM.
    - `errorMessage`: The error message if the operation failed.
    - `operationId`: The identifier of the operation.
  (error requests will be processed in future version)
#### **Usage**:
  ```typescript
  const tracker = new OperationTracker(
        network: Network.Testnet
  );
  const { status, errorMessage } = await tracker.getOperationStatus(operationId);
  if (errorMessage) {
      console.log('Error:', status);
  }
  console.log('Operation Status:', status);
  ```

---

### * Use Simplified Status (instead of 1 and 2 steps)

Use the `getSimplifiedOperationStatus(transactionLinker)` method for an easy-to-interpret status.

#### Method: `getSimplifiedOperationStatus(transactionLinker: TransactionLinker, isBridgeOperation: boolean = false): Promise<SimplifiedStatuses>`

Fetches a simplified operation status using the `transactionLinker`.

#### **Parameters**:
  - `transactionLinker`: A `TransactionLinker` object returned from `sendCrossChainTransaction` function.
  - `isBridgeOperation` *(optional)*: If your operation should only execute on EVM side without returning to TVM set `isBridgeOperation` to **true**. TAC protocol can just bridge the assets.

#### **Returns**:
- **`Promise<SimplifiedStatuses>`**:
  - A simplified status from the `SimplifiedStatuses` enum:
    - **`Pending`**: The operation is still in progress.
    - **`Successful`**: The operation has successfully completed.
    - **`OperationIdNotFound`**: The operation ID could not be found.
    - **`Failed`**: The operation failed.

#### **Usage**
Here operationId will be always requested(not optimal).
```typescript
const tracker = new OperationTracker();
const simplifiedStatus = await tracker.getSimpifiedOperationStatus(transactionLinker);
console.log('Simplified Status:', simplifiedStatus);
```

---
### Other functions

#### Method: `getOperationIdsByShardsKeys(shardsKeys: string[], caller: string): Promise<OperationIdsByShardsKey>`

Retrieves operation IDs associated with specific shard keys for a given caller. Shard keys uniquely identify shards within the TON network, and this method maps them to their corresponding operation IDs.

##### **Parameters**

- **`shardsKeys`**: An array of shard keys for which operation IDs are to be fetched.
- **`caller`**: The address of the caller initiating the request.

##### **Returns**

- **`Promise<OperationIdsByShardsKey>`**: A promise that resolves to a mapping of shard keys to their corresponding operation IDs.


#### Method: `getStageProfiling(operationId: string): Promise<ExecutionStages>`

Fetches profiling information for all execution stages of operation identified by its operation ID.

##### **Parameters**

- **`operationId`**: The unique identifier of the operation whose profiling data is to be retrieved.

##### **Returns**

- **`Promise<ExecutionStages>`**: A promise that resolves to the profiling data of the operation's execution stages.


#### Method: `getStageProfilings(operationIds: string[]): Promise<ExecutionStagesByOperationId>`

Retrieves profiling information for multiple operations at once.

##### **Parameters**

- **`operationIds`**: An array of operation IDs for which profiling data is to be fetched.

##### **Returns**

- **`Promise<ExecutionStagesByOperationId>`**: A promise that resolves to a mapping of operation IDs to their corresponding execution stages profiling data.


#### Method: `getOperationStatuses(operationIds: string[]): Promise<StatusInfosByOperationId>`

Fetches the current status information for multiple operations based on their operation IDs. 

##### **Parameters**

- **`operationIds: string[]`**: An array of operation IDs whose statuses need to be retrieved.

##### **Returns**

- **`Promise<StatusInfosByOperationId>`**: A promise that resolves to a mapping of operation IDs to their respective status information.


---
### startTracking

Track the execution of crosschain operation with `startTracking` method

#### Method: `async startTracking(transactionLinker: TransactionLinker, network: network, isBridgeOperation: boolean = false, customLiteSequencerEndpoints?: string[]): Promise<void>`

#### **Parameters**:
  - `transactionLinker`: A `TransactionLinker` object returned from `sendCrossChainTransaction` function.
  - `network`: TON network (`Network` type).
  - `isBridgeOperation` *(optional)*: If your operation should only execute on EVM side without returning to TVM set `isBridgeOperation` to **true**. TAC protocol can just bridge the assets.
  - `customLiteSequencerEndpoints` *(optional)*: specify custom lite sequencer API URL for sending requests there.

#### **Returns**:
- void:
  - Will stop requesting status once the final status of crosschain operation has been reached.

#### **Possible exceptions**

- **`FetchError`**: failed to fetch operation id or status of operation from lite sequencer.

#### **Usage**
Here operationId will be always requested(not optimal).
```typescript
await startTracking(transactionLinker, network.Testnet);
```

---

## Structures Description

### `Network (Enum)`
Represents TON network type you want to use.
```typescript
export enum Network {
    Testnet = 'testnet',
    Mainnet = 'mainnet'
}
```

- **`Testnet`**: Represents the testnet TON network.
- **`Mainnet`**: Represents the mainnet TON network.


### `SDKParams (Type)`
```typescript
export type SDKParams = {
    network: Network;
    delay?: number;
    TACParams?: TACParams;
    TONParams?: TONParams;
    customLiteSequencerEndpoints?: string[];
}
```

Parameters for SDK:
- **`network`**: Specifies TON network (`Network` type).
- **`delay`** *(optional)*: Delay (in seconds) for requests to the TON client. Default is *0*.
- **`TACParams`** *(optional)*: Custom parameters for TAC side
- **`TONParams`** *(optional)*: Custom parameters for TON side
- **`customLiteSequencerEndpoints`** *(optional)*: Custom lite sequencer endpoints for API access.


### `TONParams (Type)`
```typescript
export type TONParams = {
    contractOpener?: ContractOpener;
    settingsAddress?: string;
}
```
TON Parameters for SDK:
- **`contractOpener`** *(optional)*: Client used for TON smart contract interaction. Default is `orbsOpener4`. Set for tests only 
- **`settingsAddress`** *(optional)*: TON settings contract address. Needed to retrieve protocol data. Set for tests only


### `TACParams (Type)`
```typescript
export type TACParams = {
    provider?: AbstractProvider;
    settingsAddress?: string | Addressable;  
    settingsABI?: Interface | InterfaceAbi;
    crossChainLayerABI?: Interface | InterfaceAbi;
    crossChainLayerTokenABI?: Interface | InterfaceAbi;
    crossChainLayerTokenBytecode?: string;
}
```

TAC Parameters for SDK:
- **`provider`** *(optional)*: Provider used for TAC smart contract interaction. Set for increasing rate limit or tests only
- **`settingsAddress`** *(optional)*: TAC settings contract address. Needed to retrieve protocol data. Set for tests only
- **`settingsABI`** *(optional)*: TAC settings contract ABI. Set for tests only 
- **`crossChainLayerABI`** *(optional)*: TAC CCL contract ABI. Set for tests only
- **`crossChainLayerTokenABI`** *(optional)*: TAC CCL Token contract ABI. Set for tests only
- **`crossChainLayerTokenBytecode`** *(optional)*: TAC CCL Token contract bytecode. Set for tests only


### `EvmProxyMsg (Type)`
```typescript
export type EvmProxyMsg = {
    evmTargetAddress: string,
    methodName?: string,
    encodedParameters?: string,
    gasLimit?: bigint,
}
```
Represents a proxy message to a TAC.
- **`evmTargetAddress`**: Target address on the EVM network.
- **`methodName`** *(optional)*: Method name to be called on the target contract. Either method name `MethodName` or signature `MethodName(bytes,bytes)` must be specified (strictly (bytes,bytes)).
- **`encodedParameters`** *(optional)*: Parameters for the method, encoded as a string.
- **`gasLimit`** *(optional)*: `gasLimit` is a parameter that will be passed on the TAC side. The executor must allocate at least gasLimit gas for executing the transaction on the TAC side. If this parameter is not specified, it will be calculated using the `simulateEVMMessage` method(prefered).

This structure defines the logic you want to execute on the TAC side. This message is sent along with all the sharded messages related to the jetton bridging, enabling the TAC to process the intended logic on the TAC side during the crosschain transaction.


### `AssetBridgingData (Type)`

This structure is used to specify the details of the Assets you want to bridge for your operation. This allows you to precisely control the tokens and amounts involved in your crosschain transaction.

```typescript
export type WithAddress = {
    /**
     * Address of TAC or TON token.
     * Empty if sending native TON coin.
     */
    address?: string;
};

export type RawAssetBridgingData = {
    /** Raw format, e.g. 12340000000 (=12.34 tokens if decimals is 9) */
    rawAmount: bigint;
} & WithAddress;

export type UserFriendlyAssetBridgingData = {
    /**
     * User friendly format, e.g. 12.34 tokens 
     * Specified value will be converted automatically to raw format: 12.34 * (10^decimals).
     * No decimals should be specified.
     */
    amount: number;
    /**
     * Decimals may be specified manually.
     * Otherwise, SDK tries to extract them from chain.
     */
    decimals?: number;
} & WithAddress;

export type AssetBridgingData = RawAssetBridgingData | UserFriendlyAssetBridgingData;
```

Represents general data for Asset operations.
- **`rawAmount`** *(required if `amount` is not specified): Amount of Assets to be transferred taking into account the number of decimals.
- **`amount`** *(required if `rawAmount` is not specified): Amount of Assets to be transferred.
- **`decimals`** *(optional)*: Number of decimals for the asset. If not specified, the SDK will attempt to extract the decimals from the chain.
- **`address`** *(optional)*: TVM or EVM asset's address.

> **Note:** If you need to transfer a native TON coin, do not specify address.


### `TransactionLinker (Type)`
```typescript
export type TransactionLinker = {
    caller: string,
    shardCount: number,
    shardsKey: string,
    timestamp: number,
    sendTransactionResult?: unknown,
}
```
Linker to track TON transaction for crosschain operation.
- **`caller`**: Address of the transaction initiator.
- **`shardCount`**: Number of shards involved.
- **`shardsKey`**: Identifier for the shard.
- **`timestamp`**: Timestamp of the transaction.
- **`sendTransactionResult`** *(optional)*: Result of sending transaction. May be used to check result of sending transaction. Default TonClient does NOT fill this field. However, in unit tests @ton/sandbox set transaction result object to this field.

This structure is designed to help track the entire execution path of a operation across all levels. By using it, you can identify the `operationId` and subsequently monitor the operation status through a public API. This is particularly useful for ensuring visibility and transparency in the operation lifecycle, allowing you to verify its progress and outcome.


### `SimplifiedStatuses (Enum)`
```typescript
export enum SimplifiedStatuses {
    Pending,
    Failed,
    Successful,
    OperationIdNotFound,
}
```
Represents the simplified operation statuses.
- **`Pending`**: The operation in progress.
- **`Failed`**: The operation has failed.
- **`Successful`**: The operation was executed successfully.
- **`OperationIdNotFound`**: The operation ID was not found.


### `ContractOpener (Interface)`

The ContractOpener interface provides methods to interact with smart contracts on the TON network. It allows opening contracts for interaction and retrieving contract states.
```typescript
export interface ContractOpener {
    open<T extends Contract>(src: T): OpenedContract<T> | SandboxContract<T>;
  
    getContractState(address: Address): Promise<{
      balance: bigint;
      state: 'active' | 'uninitialized' | 'frozen';
      code: Buffer | null;
    }>;
}
```


### `EVMSimulationRequest`

```typescript
export type EVMSimulationRequest = {
    evmCallParams: {
        arguments: string;
        methodName: string;
        target: string;
    };
    extraData: string;
    feeAssetAddress: string;
    shardsKey: number;
    tvmAssets: {
        amount: string;
        tokenAddress: string;
    }[];
    tvmCaller: string;
};
```

Represents a request to simulate an EVM message.

- **`evmCallParams`**: An object containing parameters for the EVM call.
  - **`arguments`**: Encoded arguments for the EVM method.
  - **`methodName`**: Name of the method to be called on the target EVM contract.
  - **`target`**: The target address on the EVM network.
- **`extraData`**: Additional non-root data to be included in EVM call.
- **`feeAssetAddress`**: Address of the asset used to cover fees; empty string if using native TON.
- **`shardsKey`**: Key identifying shards for the operation.
- **`tvmAssets`**: An array of assets involved in the transaction.
  - **`amount`**: Amount of the asset to be transferred.
  - **`tokenAddress`**: Address of the token.
- **`tvmCaller`**: Address of the caller in the TVM.


### `TransactionData`

```typescript
export type TransactionData = {
    hash: string;
};
```

Represents transaction details.
- **`hash`**: The hash of the transaction.


### `NoteInfo`

```typescript
export type NoteInfo = {
  content: string;
  errorName: string;
  internalMsg: string;
  internalBytesError: string;
};
```

Provides detailed information about any notes or errors encountered during operation processing.

- **`content`**: Content of the note.
- **`errorName`**: Name of the error.
- **`internalMsg`**: Internal message related to the note or error.
- **`internalBytesError`**: Detailed bytes error information.


### `StageData`

```typescript
export type StageData = {
  success: boolean;
  timestamp: number;
  transactions: TransactionData[] | null;
  note: NoteInfo | null;
};
```

Represents data for a specific stage of operation execution.

#### **Properties**

- **`success`**: Indicates whether the stage was successful.
- **`timestamp`**: Timestamp of when the stage was executed.
- **`transactions`** *(optional)*: Array of transaction data related to the stage. `null` if none.
- **`note`** *(optional)*: Additional notes or errors related to the stage. `null` if none.


### `StatusInfo`

```typescript
export type StatusInfo = StageData & {
  stage: string;
};
```

Combines `StageData` with an additional stage identifier.

- **`stage`**: Name of the current stage.

- **Other Properties from `StageData`**


### `ProfilingStageData`

```typescript
export type ProfilingStageData = {
  exists: boolean;
  stageData: StageData | null;
};

```

Provides profiling information for a specific stage.

- **`exists`**: Indicates whether profiling data exists for the stage.

- **`stageData`** *(optional)*: Detailed data of the stage. `null` if none.


### `ExecutionStages`

```typescript
export type ExecutionStages = {
  evmMerkleMsgCollected: ProfilingStageData;
  evmMerkleRootSet: ProfilingStageData;
  evmMerkleMsgExecuted: ProfilingStageData;
  tvmMerkleMsgCollected: ProfilingStageData;
  tvmMerkleMsgExecuted: ProfilingStageData;
};
```

Represents the profiling data for all execution stages within an operation.

- **`evmMerkleMsgCollected`**: Profiling data for the EVM Merkle message collection stage.
- **`evmMerkleRootSet`**: Profiling data for setting the EVM Merkle root.
- **`evmMerkleMsgExecuted`**: Profiling data for executing the EVM Merkle message.
- **`tvmMerkleMsgCollected`**: Profiling data for the TVM Merkle message collection stage.
- **`tvmMerkleMsgExecuted`**: Profiling data for executing the TVM Merkle message.


### `ExecutionStagesByOperationId`

```typescript
export type ExecutionStagesByOperationId = Record<string, ExecutionStages>;
```

Maps each `operationId` to its respective `executionStages`.


### `StatusInfosByOperationId`

```typescript
export type StatusInfosByOperationId = Record<string, StatusInfo>;
```

Maps each `operationId` to its respective `statusInfo`.


### `OperationIdsByShardsKeyResponse`

Maps each `operationId[]` to its respective `shardsKey`.


### `UserWalletBalanceExtended`

Provides extended information about a user's Jetton balance.

#### **Union Types**

- **If the Jetton wallet exists:**
  ```typescript
  {
      exists: true;
      amount: number;       // The formatted balance of the Jetton token.
      rawAmount: bigint;    // The raw balance of the Jetton token.
      decimals: number;     // The number of decimals for the Jetton token.
  }
  ```

- **If the Jetton wallet does not exist:**
  ```typescript
  {
      exists: false;
  }
  ```


- **`exists`**: Indicates whether the Jetton wallet exists.
- **`amount`** *(optional)*: The formatted balance of the Jetton token. Present only if `exists` is `true`.
- **`rawAmount`** *(optional)*: The raw balance of the Jetton token. Present only if `exists` is `true`.
- **`decimals`** *(optional)*: The number of decimals for the Jetton token. Present only if `exists` is `true`.


### `EVMSimulationResults`

```typescript
export type EVMSimulationResults = {
  estimatedGas: bigint;
  estimatedJettonFeeAmount: string;
  feeParams: {
    currentBaseFee: string;
    isEip1559: boolean;
    suggestedGasPrice: string;
    suggestedGasTip: string;
  };
  message: string;
  outMessages:
          | {
    callerAddress: string;
    operationId: string;
    payload: string;
    queryId: number;
    targetAddress: string;
    tokensBurned: {
      amount: string;
      tokenAddress: string;
    }[];
    tokensLocked: {
      amount: string;
      tokenAddress: string;
    }[];
  }[]
          | null;
  simulationError: string;
  simulationStatus: boolean;
  debugInfo: {
    from: string;
    to: string;
    callData: string;
    blockNumber: number;
  };
};
```
Provides EVM simulation results.

  - **`estimatedGas`**: The estimated gas required for the message.
  - **`estimatedJettonFeeAmount`**: The estimated fee amount in Jettons.
  - **`feeParams`**: The parameters related to the fee.
    - **`currentBaseFee`**: The current base fee.
    - **`isEip1559`**: Indicates if EIP-1559 is applied.
    - **`suggestedGasPrice`**: The suggested gas price.
    - **`suggestedGasTip`**: The suggested gas tip.
  - **`message`**: The message details.
  - **`outMessages`** *(optional)*: The outgoing messages. Maybe `null` if there is a bridge operation.
    - **`callerAddress`**: The address of the caller.
    - **`operationId`**: The operation ID.
    - **`payload`**: The payload.
    - **`queryId`**: The query ID.
    - **`targetAddress`**: The target address.
    - **`tokensBurned`**: The tokens burned.
      - **`amount`**: The amount of tokens burned.
      - **`tokenAddress`**: The address of the token.
    - **`tokensLocked`**: The tokens locked.
  - **`simulationError`**: Any error encountered during the simulation.
  - **`simulationStatus`**: The status of the simulation.
  - **`debugInfo`**: Debugging information.
    - **`from`**: The sender address.
    - **`to`**: The recipient address.
    - **`callData`**: The call data.
    - **`blockNumber`**: The block number.
---

## Usage

```typescript
import { TacSdk } from '@tonappchain/sdk';
import { TonConnectUI } from '@tonconnect/ui';
import { ethers } from 'ethers';

// Create EVM payload for DappProxy
const abi = new ethers.AbiCoder();
const encodedParameters = abi.encode(
    ['tuple(uint256,uint256,address[],address)'],
    [
        [
            tokenAAmount,
            tokenBAmount,
            [EVMtokenAAddress, EVMtokenBAddress],
            proxyDapp
        ]
    ]
);
const evmProxyMsg: EvmProxyMsg = {
    evmTargetAddress: DappProxyAddress,
    methodName: 'addLiquidity',
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

const sdkParams: SDKParams = {
    network: Network.Testnet
};
const tacSdk = await TacSdk.create(sdkParams);

//Send transaction via tonConnect or mnemonic
const tonConnectUI = new TonConnectUI({
    manifestUrl: config.tonconnectManifestUrl as string
});
const sender = await SenderFactory.getSender({
    tonConnect: tonConnectUI
});

await tacSdk.sendCrossChainTransaction(evmProxyMsg, sender, assets);

tacSdk.closeConnections();
```
For a detailed example, see `test/sendSwap.ts` or `test/sendRemoveLiquidity.ts`, which demonstrates swapping tokens and removing liquidity on Uniswap and tracking the transaction status.

---

## License

MIT
