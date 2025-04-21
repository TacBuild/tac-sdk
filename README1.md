# TacSdk 

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

## Available Resources


### SDK Components

- **[`TacSdk`](./docs/sdks/tac_sdk.md)**: The main class for interacting with the TAC protocol.
  - [`create`](./docs/sdks/tac_sdk.md#create-static): Initializes the SDK instance.
  - [`sendCrossChainTransaction`](./docs/sdks/tac_sdk.md#sendcrosschaintransaction): Sends a cross-chain transaction from TON to TAC.
  - [`getEVMTokenAddress`](./docs/sdks/tac_sdk.md#getevmtokenaddress): Gets the TAC address for a TON token.
  - [`getTVMTokenAddress`](./docs/sdks/tac_sdk.md#gettvmtokenaddress): Gets the TON address for a TAC token.
  - [`getTransactionSimulationInfo`](./docs/sdks/tac_sdk.md#simulatetacmessage): Performs a complete simulation of a crosschain transaction to estimate fees and gather execution-related metadata.  
  - [`getUserJettonBalance`](./docs/sdks/tac_sdk.md#getuserjettonbalance): Gets a user's Jetton balance (raw).
  - [`getUserJettonBalanceExtended`](./docs/sdks/tac_sdk.md#getuserjettonbalanceextended): Gets extended Jetton balance info (including decimals).
  - [`getUserJettonWalletAddress`](./docs/sdks/tac_sdk.md#getuserjettonwalletaddress): Calculates a user's Jetton wallet address.
  - [`nativeTONAddress (getter)`](./docs/sdks/tac_sdk.md#nativetonaddress-getter): Placeholder address for native TON.
  - [`nativeTACAddress (getter)`](./docs/sdks/tac_sdk.md#nativetacaddress-getter): Gets the native asset address on the TAC chain.
  - *(See file for more...)*

- **[`OperationTracker`](./docs/sdks/operation_tracker.md)**: Tools for monitoring cross-chain operation status.
  - [`constructor`](./docs/sdks/operation_tracker.md#constructor): Creates a tracker instance.
  - [`getOperationId`](./docs/sdks/operation_tracker.md#getoperationid): Retrieves the Operation ID from a `TransactionLinker`.
  - [`getStageProfiling`](./docs/sdks/operation_tracker.md#getstageprofiling): Gets detailed timing and status for all stages of an operation.
  - [`getSimplifiedOperationStatus`](./docs/sdks/operation_tracker.md#getsimplifiedoperationstatus): Gets a simplified overall status (Pending, Successful, Failed, Not Found).
  - *(See file for more...)*

- **[`Senders`](./docs/sdks/senders.md)**: Handles signing and sending TON transactions.
  - [`TonConnectSender`](./docs/sdks/senders.md#tonconnectsender): Implements sending via TonConnect UI.
  - [`RawSender`](./docs/sdks/senders.md#rawsender): Implements sending using a raw private key.

- **[`Utilities`](./docs/sdks/utilities.md)**: Helper functions and interfaces.
  - [`startTracking`](./docs/sdks/utilities.md#starttracking): Utility function to poll and log operation status to the console.

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
  - *(See file for more...)*

Navigate through the linked files for full details on parameters, return types, examples, and more.

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
    network: Network.TESTNET
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