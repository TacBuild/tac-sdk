# TacSdk Class

**Table of Contents**

- [TacSdk Class](#tacsdk-class)
  - [`create` (static)](#create-static)
  - [`closeConnections`](#closeconnections)
  - [`nativeTONAddress` (getter)](#nativetonaddress-getter)
  - [`nativeTACAddress` (getter)](#nativetacaddress-getter)
  - [`sendCrossChainTransaction`](#sendcrosschaintransaction)
  - [`getUserJettonWalletAddress`](#getuserjettonwalletaddress)
  - [`getUserJettonBalance`](#getuserjettonbalance)
  - [`getUserJettonBalanceExtended`](#getuserjettonbalanceextended)
  - [`getEVMTokenAddress`](#getevmtokenaddress)
  - [`getTVMTokenAddress`](#gettvmtokenaddress)
  - [`simulateTACMessage`](#simulatetacmessage)

## `create` (static)

Initializes and returns an instance of the `TacSdk`. This is the entry point for interacting with the SDK.

**Parameters**

- `sdkParams` (SDKParams): Configuration object for the SDK.
  - `network` (Network): The target network (`Network.MAINNET` or `Network.TESTNET`).
  - `delay` (number, optional): Delay in seconds between TON blockchain reads, used internally to prevent rate-limiting. Default: `1.5`.
  - `TONParams` (TONParams, optional): Custom TON network parameters.
  - `TACParams` (TACParams, optional): Custom TAC network parameters.
  - `customLiteSequencerEndpoints` (string[], optional): Override default Lite Sequencer endpoints for simulation.

**Returns**

- `Promise<TacSdk>`: A promise that resolves to a configured `TacSdk` instance.

```ts
import { TacSdk, Network } from '@tonappchain/sdk';

const sdk = await TacSdk.create({
  network: Network.TESTNET, // Or Network.MAINNET
  // Optional parameters can be added here
  // delay: 2,
  // TONParams: { ... },
  // TACParams: { ... },
});

console.log('TAC SDK Initialized');
```

## `closeConnections`

Closes any persistent connections established by the underlying contract opener (e.g., TonClient connections). It's good practice to call this when the SDK instance is no longer needed to release resources.

**Parameters**

- None

**Returns**

- `unknown`: The return value depends on the specific contract opener's implementation.

```ts
// Assuming 'sdk' is an initialized TacSdk instance
sdk.closeConnections();
console.log('Connections closed (if applicable).');
```

## `nativeTONAddress` (getter)

Provides a placeholder string (`'NONE'`) representing the native TON coin address. This is used internally to differentiate TON coin transfers from Jetton transfers in asset lists.

**Returns**

- `string`: Always returns `'NONE'`.

**Why it's useful:**

- Allows specifying native TON coin amounts within the `assets` array of `sendCrossChainTransaction` without needing a real token address.

```ts
import { TacSdk, Network } from '@tonappchain/sdk';

const sdk = await TacSdk.create({ network: Network.TESTNET });

const tonPlaceholder = sdk.nativeTONAddress; // Returns 'NONE'

// Example usage in sendCrossChainTransaction assets:
const assets = [
  { amount: 10, decimals: 9 }, // Implies native TON using the getter's value internally
  // { amount: 10, decimals: 9, address: sdk.nativeTONAddress } // Explicitly using it (less common)
];
```

## `nativeTACAddress` (getter)

Asynchronously retrieves the address representing the native TAC coin (e.g., ETH on Ethereum, BNB on BSC) from the TAC `CrossChainLayer` contract.

**Returns**

- `Promise<string>`: A promise that resolves to the native token address on the TAC side.

**Why it's useful:**

- Needed if you need to interact with or reference the native TAC asset specifically.

```ts
// Assuming 'sdk' is an initialized TacSdk instance
async function logNativeTacAddress() {
  const nativeAddress = await sdk.nativeTACAddress;
  console.log('Native TAC Address:', nativeAddress);
}

logNativeTacAddress();
```

## `sendCrossChainTransaction`

Creates and sends a TON-side transaction that bridges data or assets to a TAC smart contract. This is the core function used for crosschain operations in the TAC SDK.

**Parameters**

- `evmProxyMsg` (EvmProxyMsg): Specifies EVM logic like the contract address and method to call.
  - At least one of `methodName` or `encodedParameters` must be provided.
  - If both are provided, `methodName` is used for gas estimation and `encodedParameters` for the actual call.
- `sender` (SenderAbstraction): An object to handle the sending wallet; can be `TonConnectSender` or `RawSender`.
- `assets` (AssetBridgingData[], optional): List of tokens or assets to bridge. Can include:
  - Native TON (by omitting `address` or setting it to `sdk.nativeTONAddress`)
  - TON Jettons (by specifying an `address`)
  - Multiple assets of different types in a single transaction
- `forceSend` (boolean, optional): Force transaction execution even if simulation fails. Default: `false`.

**Returns**

- `Promise<TransactionLinker>`: A promise that resolves to a `TransactionLinker`, which you can use to track the status of the crosschain operation.

**Throws**

- `ContractError`: if the jetton contract doesn't exist on TVM.
- `AddressError`: if an invalid token address is passed.
- `SimulationError`: if the simulation fails and `forceSend` is `false`.

**Internal Logic Note:** When bridging Jettons, the SDK determines whether to perform a standard Jetton `transfer` (to the Jetton Proxy address) or a Jetton `burn` operation. It checks if the Jetton master contract code matches the standard code deployed via TAC and if its configuration points to the correct TAC `CrossChainLayer` address. If it matches (indicating a Jetton deployed specifically for bridging via TAC), it uses `burn`; otherwise, it uses `transfer`.

```ts
import { TacSdk, Network, TonConnectSender /* or RawSender/SenderFactory */ } from '@tonappchain/sdk';

// Assuming sender is initialized (e.g., TonConnectSender or via SenderFactory)
// const sender = new TonConnectSender(tonConnectUI);
// or
// const sender = await SenderFactory.getSender({ network: Network.TESTNET, version: 'V4', mnemonic: '...' });

async function sendTx(sender: SenderAbstraction) {
  const sdk = await TacSdk.create({ network: Network.TESTNET });

  const txLinker = await sdk.sendCrossChainTransaction(
    {
      // EVM Call Details
      evmTargetAddress: '0x...',
      methodName: 'yourSolidityMethod(uint256,address)',
      encodedParameters: '0xABIEncodedData...',
      // gasLimit: 500000n // Optional: SDK will estimate if omitted
    },
    sender, // Your initialized SenderAbstraction
    [
      // Assets to Bridge (Optional)
      { amount: 10.5, decimals: 9 }, // Native TON (address omitted)
      { address: 'EQ...', amount: 100, decimals: 6 }, // Jetton by address
      // { address: '0x...', amount: 50 } // Can also use EVM address if decimals known/fetched
    ],
    false // forceSend (optional, default: false)
  );

  console.log('Cross-chain transaction sent! Transaction Linker:', txLinker);
  
  // You can now use txLinker with OperationTracker or startTracking
  // await startTracking(txLinker, Network.TESTNET);
}

// Replace with your actual sender initialization
// sendTx(sender);
```

## `getUserJettonWalletAddress`

Calculates and returns the address of a user's Jetton wallet for a specific Jetton master contract on the TON blockchain.

**Parameters**

- `userAddress` (string): The user's TON wallet address.
- `tokenAddress` (string): The address of the Jetton master contract.

**Returns**

- `Promise<string>`: A promise resolving to the calculated Jetton wallet address for the user.

**Throws**

- `AddressError`: If `userAddress` or `tokenAddress` are invalid TON addresses.

```ts
// Assuming 'sdk' is an initialized TacSdk instance
const userTonAddress = 'UQ...'; // Replace with user's TON address
const jettonMasterAddress = 'EQ...'; // Replace with Jetton master address

async function logUserJettonWallet() {
  const walletAddress = await sdk.getUserJettonWalletAddress(userTonAddress, jettonMasterAddress);
  console.log('User Jetton Wallet Address:', walletAddress);
}

logUserJettonWallet();
```

## `getUserJettonBalance`

Retrieves the raw balance (in the smallest indivisible units) of a specific Jetton for a given user's TON wallet.

**Parameters**

- `userAddress` (string): The user's TON wallet address.
- `tokenAddress` (string): The address of the Jetton master contract.

**Returns**

- `Promise<bigint>`: A promise resolving to the user's raw Jetton balance.

**Throws**

- `AddressError`: If `userAddress` or `tokenAddress` are invalid TON addresses.
- Errors if the Jetton master or user wallet contract cannot be accessed.

```ts
// Assuming 'sdk' is an initialized TacSdk instance
const userTonAddress = 'UQ...'; // Replace with user's TON address
const jettonMasterAddress = 'EQ...'; // Replace with Jetton master address

async function logUserJettonBalance() {
  try {
    const rawBalance = await sdk.getUserJettonBalance(userTonAddress, jettonMasterAddress);
    console.log('User Raw Jetton Balance:', rawBalance.toString()); 
    // Note: You might need decimals to display this nicely
  } catch (error) {
    console.error('Error fetching balance:', error);
  }
}

logUserJettonBalance();
```

## `getUserJettonBalanceExtended`

Retrieves detailed balance information for a user's Jetton, including the raw amount, decimals, and a human-readable amount. Also checks if the Jetton master contract exists.

**Parameters**

- `userAddress` (string): The user's TON wallet address.
- `tokenAddress` (string): The address of the Jetton master contract.

**Returns**

- `Promise<UserWalletBalanceExtended>`: A promise resolving to an object containing:
  - `exists` (boolean): `false` if the Jetton master contract is not active.
  - `rawAmount` (bigint, optional): The raw balance (if `exists` is `true`).
  - `decimals` (number, optional): The Jetton's decimals (if `exists` is `true`). If not specified in the contract metadata, defaults to 9.
  - `amount` (number, optional): The human-readable balance (if `exists` is `true`) calculated as `rawAmount / (10^decimals)`.

**Throws**

- `AddressError`: If `userAddress` or `tokenAddress` are invalid TON addresses.

```ts
// Assuming 'sdk' is an initialized TacSdk instance
const userTonAddress = 'UQ...'; // Replace with user's TON address
const jettonMasterAddress = 'EQ...'; // Replace with Jetton master address

async function logExtendedBalance() {
  const balanceInfo = await sdk.getUserJettonBalanceExtended(userTonAddress, jettonMasterAddress);
  if (balanceInfo.exists) {
    console.log('Jetton Exists:', balanceInfo.exists);
    console.log('Raw Amount:', balanceInfo.rawAmount?.toString());
    console.log('Decimals:', balanceInfo.decimals);
    console.log('Readable Amount:', balanceInfo.amount);
  } else {
    console.log('Jetton Master contract not found or inactive.');
  }
}

logExtendedBalance();
```

## `getEVMTokenAddress`

Calculates or retrieves the corresponding TAC (EVM-compatible) token address for a given TON (TVM) Jetton address. It handles both native TON coin and standard Jettons, including those deployed via the TAC protocol.

**Parameters**

- `tvmTokenAddress` (string): The address of the token on the TON blockchain (use `sdk.nativeTONAddress` or `'NONE'` for native TON).

**Returns**

- `Promise<string>`: A promise resolving to the corresponding token address on the TAC chain.

**Throws**

- `AddressError`: If `tvmTokenAddress` is an invalid TON address (unless it's `'NONE'`).

```ts
// Assuming 'sdk' is an initialized TacSdk instance
const tonJettonAddress = 'EQ...'; // Replace with Jetton master address

async function logEvmEquivalentAddress() {
  const evmAddress = await sdk.getEVMTokenAddress(tonJettonAddress);
  console.log(`EVM address for ${tonJettonAddress}:`, evmAddress);

  const nativeEvmAddress = await sdk.getEVMTokenAddress(sdk.nativeTONAddress);
  console.log(`EVM address for native TON:`, nativeEvmAddress);
}

logEvmEquivalentAddress();
```

## `getTVMTokenAddress`

Calculates or retrieves the corresponding TON (TVM) Jetton address for a given TAC (EVM-compatible) token address. It checks if the EVM address corresponds to a TAC-deployed token or calculates the expected address otherwise.

**Parameters**

- `evmTokenAddress` (string): The address of the token on the TAC blockchain.

**Returns**

- `Promise<string>`: A promise resolving to the corresponding Jetton master address on the TON blockchain.

**Throws**

- `AddressError`: If `evmTokenAddress` is an invalid EVM address.

```ts
// Assuming 'sdk' is an initialized TacSdk instance
const evmTokenAddress = '0x...'; // Replace with TAC token address

async function logTvmEquivalentAddress() {
  const tvmAddress = await sdk.getTVMTokenAddress(evmTokenAddress);
  console.log(`TVM address for ${evmTokenAddress}:`, tvmAddress);
}

logTvmEquivalentAddress();
```

## `simulateTACMessage`

Simulates a cross-chain message execution on the TAC side using the Lite Sequencer service. This helps estimate gas costs and verify potential success before sending the actual TON transaction.

**Parameters**

- `req` (TACSimulationRequest): The simulation request object, containing details about the TON caller, assets being bridged, and the target EVM call.
  - `tonCaller` (string): TON address initiating the call.
  - `shardsKey` (string): Unique identifier linking potential multiple TON transactions.
  - `tonAssets` (Array<{ tokenAddress: string; amount: string }>): Assets being bridged (raw amounts as strings).
  - `tacCallParams` ({ target: string; methodName: string; arguments: string }): EVM call details (target address, formatted method name, encoded arguments).
  - `feeAssetAddress` (string, optional): Address of asset used for fees (often native TAC).
  - `extraData` (string, optional): Additional data for the call.

**Returns**

- `Promise<TACSimulationResults>`: A promise resolving to the simulation results.
  - `simulationStatus` (boolean): Indicates if the simulation was successful.
  - `estimatedGas` (string): Estimated gas cost for the TAC transaction (if successful). Though this is a string in the API response, the SDK often parses it to a `bigint` internally.
  - `message` (string, optional): Error message if simulation failed.
  - `simulationError` (string, optional): Detailed error info.
  - `feeParams` (object): Suggested gas price/tip info.
    - `currentBaseFee` (string): Base fee in the current TAC block.
    - `isEip1559` (boolean): Whether the TAC chain supports EIP-1559.
    - `suggestedGasPrice` (string): Recommended gas price (for pre-EIP-1559).
    - `suggestedGasTip` (string): Recommended priority fee/tip (for EIP-1559).
  - `outMessages` (object[] | null): Details of resulting messages/events on TAC.
  - `debugInfo` (object): Info used for simulation call.
    - `from` (string): Simulated sender address.
    - `to` (string): Destination contract address.
    - `callData` (string): Encoded calldata.
    - `blockNumber` (number): Block number used for simulation.
  - `estimatedJettonFeeAmount` (string): Estimated fee amount for Jetton operations.

**Throws**

- `SimulationError`: If all Lite Sequencer endpoints fail to respond or return errors.

```ts
// Assuming 'sdk' is an initialized TacSdk instance
// Assuming 'simulationRequestBody' is a valid TACSimulationRequest object

async function runSimulation(simulationRequestBody: TACSimulationRequest) {
  try {
    const results = await sdk.simulateTACMessage(simulationRequestBody);
    if (results.simulationStatus) {
      console.log('Simulation successful!');
      console.log('Estimated Gas:', results.estimatedGas);
    } else {
      console.error('Simulation failed:', results.message);
    }
  } catch (error) {
    console.error('Simulation request failed:', error);
  }
}

// Example Request Body (replace with actual data)
const requestBody: TACSimulationRequest = {
  tonCaller: 'UQ...', 
  shardsKey: '...', 
  tonAssets: [{ tokenAddress: 'EQ...', amount: '1000000000' }], 
  tacCallParams: {
    target: '0x...', 
    methodName: 'doThing(uint256)', 
    arguments: '0x...'
  }
};

runSimulation(requestBody);
``` 