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

To track a transaction, you first need to obtain its `operationId`. The `operationId` can be retrieved using the `transactionLinker` structure, which is generated within the SDK and returned by the `sendShardTransaction` function. Once you have the `transactionLinker`, call `getOperationId(transactionLinker: TransactionLinker, customLiteSequencerEndpoint?: string)`.

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

// Create wrappers transfer messages corresponding to EVM tokens, e.g., two tokens for adding liquidity to a pool
const jettons: JettonOpGeneralData[] = [
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

return await tacSdk.sendCrossChainJettonTransaction(jettons, evmProxyMsg, sender);
```
For a detailed example, see `test/sendSwap.ts` or `test/sendRemoveLiquidity.ts`, which demonstrates swapping tokens and removing liquidity on Uniswap and tracking the transaction status.

## License

MIT
