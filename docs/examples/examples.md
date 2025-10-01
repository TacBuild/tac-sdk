# TAC-TON, TON-TAC, and TON-TAC-TON Transaction Documentation

This documentation describes various types of cross-chain transactions in the TAC ecosystem.

## Transaction Types Overview

### 1. TAC-TON Transactions
Transactions from TAC network to TON network (EVM -> TVM).

### 2. TON-TAC Transactions
Transactions from TON network to TAC network (TVM -> EVM).

### 3. TON-TAC-TON Transactions
Complex transactions that start in TON, pass through TAC and return back to TON.

---

## 1. TON-TAC Transactions (TVM -> EVM)

### Description
Transfer of tokens from TVM part to EVM part through the bridge.

```typescript
import { TacSdk, Network, SenderFactory, AssetLike, EvmProxyMsg, StageName } from '@tonappchain/sdk';
import { ConsoleLogger } from '@tonappchain/sdk';

// 1. Transaction formation
const tacSdk = await TacSdk.create(
    {
        network: Network.TESTNET, // or 'mainnet'
        // other configuration parameters
    },
    new ConsoleLogger(),
);

const sender = await SenderFactory.getSender({
    network: Network.TESTNET,
    version: env.TVM_SENDER_WALLET_VERSION, // Need to specify WALLET_VERSION
    mnemonic: env.TVM_SENDER_MNEMONICS, // Need to specify mnemonic phrase
});

const TKA_ADDRESS = 'EQBLi0v_y-KiLlT1VzQJmmMbaoZnLcMAHrIEmzur13dwOmM1'; // Example address, preferably set your Jetton address
const bridgeAmount_TVM_TO_EVM = 1_000_000_000n;
const TKA = await tacSdk.getFT(TKA_ADDRESS); // Getting token via tacSdk
const assets: AssetLike[] = [TKA.withRawAmount(bridgeAmount_TVM_TO_EVM)];
const evmProxyMsg: EvmProxyMsg = {
    evmTargetAddress: env.EVM_ACCOUNT_ADDRESS, // Need to specify EVM recipient address
};

// 2. Transaction sending
const transactionLinker = await tacSdk.sendCrossChainTransaction(evmProxyMsg, sender, assets);

// 3. Transaction completion waiting
const operationId = transactionLinker.operationId!;

// Waiting for funds collection in TAC
await tacSdk.getOperationTracker().getOperationStatus(operationId, {
    logger: new ConsoleLogger(),
    successCheck: (status) => status.stage === StageName.COLLECTED_IN_TAC, // Wait for funds to be collected in TAC
});

// Waiting for execution in TAC
await tacSdk.getOperationTracker().getOperationStatus(operationId, {
    logger: new ConsoleLogger(),
    successCheck: (status) => status.stage === StageName.EXECUTED_IN_TAC,
});
```

### Key Features:
- **Formation**: Getting token via `tacSdk.getFT()` and creating assets array
- **Sending**: Using `tacSdk.sendCrossChainTransaction()` for initiation
- **Waiting**: Stage tracking via `tacSdk.getOperationTracker().getOperationStatus()` with `successCheck` parameter
- Required stages: `COLLECTED_IN_TAC` → `EXECUTED_IN_TAC`

---

## 2. TAC-TON Transactions (EVM -> TVM)

### Description

```typescript
import { TacSdk, Network, SenderFactory, StageName } from '@tonappchain/sdk';
import { ConsoleLogger } from '@tonappchain/sdk';
import { Wallet } from 'ethers';
import { ethers } from 'ethers';

// 1. Transaction formation
const tacSdk = await TacSdk.create(
    {
        network: Network.TESTNET, // or 'mainnet'
        // other configuration parameters
    },
    new ConsoleLogger(),
);

const sender = await SenderFactory.getSender({
    network: Network.TESTNET,
    version: env.TVM_SENDER_WALLET_VERSION, // Need to specify WALLET_VERSION
    mnemonic: env.TVM_SENDER_MNEMONICS, // Need to specify mnemonic phrase
});
const EVMAccount = new Wallet(env.EVM_SENDER_PRIVATE_KEY, ethers.JsonRpcProvider(env.EVM_NODE_URL)); // Need to specify your EVM_SENDER_PRIVATE_KEY and EVM_NODE_URL

const TKA_ADDRESS = 'EQBLi0v_y-KiLlT1VzQJmmMbaoZnLcMAHrIEmzur13dwOmM1'; // Example address, preferably set your Jetton address
const TKA = await tacSdk.getFT(TKA_ADDRESS); // Getting token via tacSdk
const bridgeAmount_EVM_TO_TVM = 1_000_000_000n;
const TACAmount = 0n;
const assets = [TKA.withRawAmount(bridgeAmount_EVM_TO_TVM)];

// 2. Transaction sending
const hash = await tacSdk.bridgeTokensToTON(EVMAccount, TACAmount, sender.getSenderAddress(), assets);

// 3. Transaction completion waiting
// Getting operation ID by hash
const operationId = await tacSdk.getOperationTracker().getOperationIdByTransactionHash(hash, {
    logger: new ConsoleLogger(),
    successCheck: (id) => !!id,
});

// Waiting for execution in TON
await tacSdk.getOperationTracker().getOperationStatus(operationId, {
    logger: new ConsoleLogger(),
    successCheck: (status) => status.stage === StageName.EXECUTED_IN_TON,
});
```

### Key Features:
- **Formation**: Getting token via `tacSdk.getFT()` and preparing assets
- **Sending**: Using `tacSdk.bridgeTokensToTON()` for initiation
- **Waiting**: Getting operation ID via `getOperationIdByTransactionHash()` and tracking via `getOperationStatus()`
- Required stage: `EXECUTED_IN_TON`

---

## 3. TON-TAC-TON Transactions (UniswapV2 Swap)

### Description
Complex transactions that perform operations in EVM part and return result back to TVM.


```typescript
import { TacSdk, Network, SenderFactory, AssetLike, EvmProxyMsg, StageName } from '@tonappchain/sdk';
import { ConsoleLogger } from '@tonappchain/sdk';
import { ethers } from 'ethers';

// 1. Transaction formation
const tacSdk = await TacSdk.create(
    {
        network: Network.TESTNET, // or 'mainnet'
        // other configuration parameters
    },
    new ConsoleLogger(),
);

const sender = await SenderFactory.getSender({
    network: Network.TESTNET,
    version: env.TVM_SENDER_WALLET_VERSION, // Need to specify WALLET_VERSION
    mnemonic: env.TVM_SENDER_MNEMONICS, // Need to specify mnemonic phrase
});

const amount = 1_000_000_000n;
const amountOutMin = 0n;

// Getting tokens
const TKA_ADDRESS = 'EQBLi0v_y-KiLlT1VzQJmmMbaoZnLcMAHrIEmzur13dwOmM1';
const TKB_ADDRESS = 'EQCsQSo54ajAorOfDUAM-RPdDJgs0obqyrNSEtvbjB7hh2oK';
const TKA = await tacSdk.getFT(TKA_ADDRESS); // Example address, preferably set your Jetton address
const TKB = await tacSdk.getFT(TKB_ADDRESS); // Example address, preferably set your Jetton address

// Preparing message for UniswapV2 swap
const abi = new ethers.AbiCoder();
const deadline = 19010987500; // unix time ~2050
const fromTokenAddress = await TKA.getEVMAddress(); // address of token we swap from
const toTokenAddress = await TKB.getEVMAddress(); // address of token we swap to
const targetAddress = '0xb4729721790F27aE23A151ed3c394193d169650c'; // address of UniswapV2 proxy contract on testnetSPB

const encodedParameters = abi.encode(
    ['tuple(uint256,uint256,address[],address,uint256)'],
    [[amount, amountOutMin, [fromTokenAddress, toTokenAddress], targetAddress, deadline]],
);

const evmProxyMsg: EvmProxyMsg = {
    evmTargetAddress: targetAddress,
    methodName: 'swapExactTokensForTokens(bytes,bytes)',
    encodedParameters,
};

const assets: AssetLike[] = [TKA.withRawAmount(amount)];

// 2. Transaction sending
const transactionLinker = await tacSdk.sendCrossChainTransaction(evmProxyMsg, sender, assets);

// 3. Transaction completion waiting
const operationId = transactionLinker.operationId!;

// Waiting for collection in TAC
await tacSdk.getOperationTracker().getOperationStatus(operationId, {
    successCheck: (status) => status.stage === StageName.COLLECTED_IN_TAC,
    onSuccess: (status) => {
        console.log(status.stage);
    },
});

// Waiting for execution in TON (swap result returns back)
await tacSdk.getOperationTracker().getOperationStatus(operationId, {
    successCheck: (status) => status.stage === StageName.EXECUTED_IN_TON,
    onSuccess: (status) => {
        console.log(status.stage);
    },
});
```

### Key Features:
- **Formation**: Getting tokens via `tacSdk.getFT()`, preparing EVM message with encoded parameters
- **Sending**: Using `tacSdk.sendCrossChainTransaction()` for swap operation initiation with wait options
- **Waiting**: Sequential stage tracking `COLLECTED_IN_TAC` → `EXECUTED_IN_TON`
- Support for various token pairs through unified interface
