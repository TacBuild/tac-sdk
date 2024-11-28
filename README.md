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

In future updates, the SDK will automatically calculate TON jetton addresses based on corresponding EVM tokens.

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

To track a transaction, you first need to obtain its `operationId`. The `operationId` can be retrieved using the `transactionLinker` structure, which is generated within the SDK and returned by the `sendShardJettonTransferTransaction` function. Once you have the `transactionLinker`, call `getOperationId(transactionLinker: TransactionLinker, customLiteSequencerEndpoint?: string)`.

> **Note:** An empty response string indicates that validators have not yet received your messages. Continue making requests until you receive a non-empty `operationId`.

After obtaining the `operationId`, you can check the transaction’s status by using `getStatusTransaction(operationId: string, customLiteSequencerEndpoint?: string)`. The following statuses may be returned:

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
    tonClientParameters?: TonClientParameters;
    network?: Network;
    delay?: number;
}
```

Parameters for the TON SDK client.
- **`tonClientParameters`** *(optional)*: Parameters for configuring the TON client.
- **`network`** *(optional)*: Specifies the blockchain network (`Network` type). Default - *Network.testnet*.
- **`delay`** *(optional)*: Delay (in seconds) for requests to the TON client. Default is *0*, but with default *tonClientParameters* better use *5*.

### `EvmProxyMsg (Type)`
Represents a proxy message to a TAC.
- **`evmTargetAddress`**: Target address on the EVM network.
- **`methodName`**: Method name to be called on the target contract.
- **`encodedParameters`**: Parameters for the method, encoded as a string.

This structure defines the logic you want to execute on the TAC side. This message is sent along with all the sharded messages related to the jetton bridging, enabling the TAC to process the intended logic on the TAC side during the cross-chain transaction.

### `JettonTransferData (Type)`
Type alias for `JettonOperationGeneralData`.

This structure is used to specify the details of the Jettons you want to bridge for your operation. This allows you to precisely control the tokens and amounts involved in your cross-chain transaction.

### `JettonOperationGeneralData (Type) internal`
Represents general data for Jetton operations.
- **`fromAddress`**: Sender's address.
- **`tokenAddress`**: TVM jetton's address.
- **`jettonAmount`**: Amount of Jetton to be transferred.
- **`tonAmount`** *(optional)*: Additional TON amount.

### `TransactionLinker (Type)`
Links a transaction to its query and shard.
- **`caller`**: Address of the transaction initiator.
- **`queryId`**: Identifier for the query.
- **`shardCount`**: Number of shards involved.
- **`shardedId`**: Identifier for the shard.
- **`timestamp`**: Timestamp of the transaction.

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

### `JettonOpType (Enum) internal`
```typescript
enum JettonOpType {
  Burn = 'Burn',
  Transfer = 'Transfer'
}
```
- **`Burn`**: If the Jetton was wrapped (i.e., originally a token from EVM), then to bridge such Jettons, they will be burned on the TVM side and unlocked on the EVM side.
- **`Transafer`**: If the Jetton originated from TVM, they should be transferred to the TVM smart contract (i.e., locked on TVM side).

### `JettonBurnData (Type) internal`
Extends `JettonOperationGeneralData` with additional fields for burn operations.
- **`notificationReceiverAddress`**: Address to send burn notification(CrossChainLayer s-c address on TVM).

### `ShardMessage (Type) internal`
Represents a message within a shard.
- **`address`**: Address of the message recipient.
- **`value`**: Value (in tokens) sent with the message.
- **`payload`**: Encoded payload (payload of bridging jettons, burn or lock).

### `ShardTransaction (Type) internal`
Represents a transaction within a shard.
- **`validUntil`**: Validity timestamp for the transaction.
- **`messages`**: Array of messages (`ShardMessage` type, bridging multiple tokens).
- **`network`**: Blockchain network (\texttt{Network} type).

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
const jettons: JettonTransferData[] = [
  {
    fromAddress: "tonUserAddress",
    tokenAddress: TVMtokenAAddress,
    jettonAmount: tokenAAmount,
  },
  {
    fromAddress: "tonUserAddress",
    tokenAddress: TVMtokenBAddress,
    jettonAmount: tokenBAmount,
  }
];

const tacSdk = new TacSdk({
  tonClientParameters: {
    endpoint: TONCENTER_URL_ENDPOINT
  },
  network: Network.Testnet,
});

// Send transaction via tonConnect or mnemonic
const tonConnectUI = new TonConnectUI({
  manifestUrl: config.tonconnectManifestUrl as string
});
const sender = new TonConnectSender(tonConnect);
// const sender = new RawSender("24 word mnemonic");

return await tacSdk.sendShardJettonTransferTransaction(jettons, evmProxyMsg, sender);
```
For a detailed example, see `test/sendSwap.ts`, which demonstrates swapping tokens on Uniswap and tracking the transaction status.

## License

MIT
