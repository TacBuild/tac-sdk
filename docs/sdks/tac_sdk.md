# TacSdk Class

**Table of Contents**

- [TacSdk Class](#tacsdk-class)
  - [`create` (static)](#create-static)
  - [`sendCrossChainTransaction`](#sendcrosschaintransaction)
  - [`getTransactionSimulationInfo`](#getTransactionSimulationInfo)
  - [`getEVMTokenAddress`](#getevmtokenaddress)
  - [`getTVMTokenAddress`](#gettvmtokenaddress)
  - [`nativeTONAddress` (getter)](#nativetonaddress-getter)
  - [`nativeTACAddress` (getter)](#nativetacaddress-getter)
  - [`getTrustedTACExecutors` (getter)](#getTrustedTACExecutors-getter)
  - [`getTrustedTONExecutors` (getter)](#nativetacaddress-getter)
  - [`getUserJettonWalletAddress`](#getuserjettonwalletaddress)
  - [`getUserJettonBalance`](#getuserjettonbalance)
  - [`getUserJettonBalanceExtended`](#getuserjettonbalanceextended)
  - [`simulateTACMessage`](#getuserjettonbalanceextended)
  - [`closeConnections`](#closeconnections)

### Creating an Instance of `TacSdk`

To use the `TacSdk` class, create it with the required parameters encapsulated in the `SDKParams` object (you can also specify custom params for TAC and TON by `TACParams` and `TONParams`): 

```typescript
import { TacSdk } from '@tonappchain/sdk';
import { Network } from '@tonappchain/sdk';

const sdkParams: SDKParams = {
  network: Network.TESTNET
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
  network: Network.TESTNET,
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

- **MAINNET**: https://toncenter.com/api/v2/jsonRPC
- **TESTNET**: https://testnet.toncenter.com/api/v2/jsonRPC

```typescript
import { TacSdk, Network } from '@tonappchain/sdk';
import { TonClient } from '@ton/ton';

const sdk = await TacSdk.create({
  network: Network.TESTNET,
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
3. Bridges Jettons by sending shard transactions to the appropriate smart contracts.
4. Incorporates EVM logic into the payload for interaction with the TAC.

---

#### Function: `getTransactionSimulationInfo`

Performs a complete simulation of a crosschain transaction to estimate fees and gather execution-related metadata.  
This method processes asset data, aggregates Jettons if needed, and builds a transaction linker to simulate a full transaction execution flow.

**Returns** a `Promise<ExecutionFeeEstimationResult>` containing the estimated fees and relevant execution simulation details.

---

#### **Parameters**

- **`evmProxyMsg`**:  
  An `EvmProxyMsg` object defining the TAC-side call parameters.  

- **`sender`**:  
  A `SenderAbstraction` instance representing the originator of the transaction.  

- **`assets`** *(optional)*:  
  An array of `AssetBridgingData` representing the tokens to bridge.  

---

#### **Returns**

- A `Promise<ExecutionFeeEstimationResult>` containing:
  - `feeParams`: Computed fee parameters for the transaction.
  - `simulation`: Detailed simulation result, including estimated gas usage, required fees, and executor payments.

---

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

---

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

### `getTrustedTACExecutors`

```ts
get getTrustedTACExecutors(): string[] {
    return this.TACParams.trustedTACExecutors;
}
```

Returns the list of trusted executor addresses for the TAC (EVM-compatible) network.  
These executors are authorized to process crosschain messages originating from or targeting the TAC side.

---

### `getTrustedTONExecutors`

```ts
get getTrustedTONExecutors(): string[] {
    return this.TACParams.trustedTONExecutors;
}
```

Returns the list of trusted executor addresses for the TON network.  
These executors are authorized to process crosschain messages originating from or targeting the TON side.

---

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

### Function: `simulateTACMessage`

This function will simulate the EVM message on the TAC side.

#### **Purpose**

The ability to simulate the EVM message is crucial for testing and debugging crosschain operations. By simulating the message, developers can verify that the transaction parameters are correctly configured and that the operation will execute.

#### **Parameters**

- **`tacCallParams`**: An object defining the EVM-specific logic:
  - **`target`**: Target address on the EVM network.
  - **`methodName`**: Method name to execute on the target contract. Either method name `MethodName` or signature `MethodName(bytes,bytes)` must be specified (strictly (bytes,bytes)).
  - **`arguments`**: Encoded parameters for the EVM method.
- **`extraData`**: Unstrusted Extra Data provided by executor.
- **`feeAssetAddress`**: TVM Fee Asset Address, empty string for native TON.
- **`shardedId`**: Sharded ID.
- **`tonAssets`**: An array of objects, each specifying the Assets details:
  - **`tokenAddress`**: Address of the Asset.
  - **`amount`**: Amount of Assets to be transferred.
- **`tonCaller`**: TVM Caller wallet address.

#### **Returns**

- **`Promise<TACSimulationResult>`**:

---
