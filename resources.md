## Available Resources and Operations

This section outlines all available resources and operations in the TAC SDK, grouped by logical modules. 

**Table of Contents**

- [Available Resources and Operations](#available-resources-and-operations)
  - [TacSdk](#tacsdk)
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
  - [OperationTracker](#operationtracker)
    - [`constructor` {#constructor-1}](#constructor-constructor-1)
    - [`getOperationType`](#getoperationtype)
    - [`getOperationId`](#getoperationid)
    - [`getOperationIdsByShardsKeys`](#getoperationidsbyshardskeys)
    - [`getStageProfiling`](#getstageprofiling)
    - [`getStageProfilings`](#getstageprofilings)
    - [`getOperationStatuses`](#getoperationstatuses)
    - [`getOperationStatus`](#getoperationstatus)
    - [`getSimplifiedOperationStatus`](#getsimplifiedoperationstatus)
  - [Senders](#senders)
    - [`SenderAbstraction` (Interface)](#senderabstraction-interface)
    - [`TonConnectSender`](#tonconnectsender)
    - [`RawSender`](#rawsender)
    - [`SenderFactory`](#senderfactory)
  - [Utilities and Helpers](#utilities-and-helpers)
    - [`startTracking`](#starttracking)
    - [`ContractOpener` (Interface)](#contractopener-interface)
    - [Contract Opener Functions (`orbsOpener4`, etc.)](#contract-opener-functions-orbsopener4-etc)
  - [Key Enums and Types](#key-enums-and-types)
    - [Enums](#enums)
    - [Core Data Structures](#core-data-structures)
    - [Simulation \& Tracking Structures](#simulation--tracking-structures)

### TacSdk

#### `create` (static)

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

#### `closeConnections`

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

#### `nativeTONAddress` (getter)

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

#### `nativeTACAddress` (getter)

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

#### `sendCrossChainTransaction`

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


#### `getUserJettonWalletAddress`

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

#### `getUserJettonBalance`

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

#### `getUserJettonBalanceExtended`

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

#### `getEVMTokenAddress`

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

#### `getTVMTokenAddress`

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

#### `simulateTACMessage`

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

### OperationTracker

Provides methods to track the status and details of cross-chain operations using the Lite Sequencer.

#### `constructor` {#constructor-1}

Creates an instance of the `OperationTracker`.

**Parameters**

- `network` (Network): The network (`Network.MAINNET` or `Network.TESTNET`) the tracker will query.
- `customLiteSequencerEndpoints` (string[], optional): Allows overriding the default Lite Sequencer endpoints for the specified network.

**Returns**

- `OperationTracker`: A new instance of the tracker.

```ts
import { OperationTracker, Network } from '@tonappchain/sdk';

const tracker = new OperationTracker(Network.TESTNET);
// const trackerWithCustomEndpoints = new OperationTracker(Network.MAINNET, ['https://custom-sequencer.com']);

console.log('Operation Tracker Initialized');
```

#### `getOperationType`

Retrieves the type of a cross-chain operation (e.g., Pending, Normal, Rollback) based on its unique Operation ID.

**Parameters**

- `operationId` (string): The unique identifier for the operation.

**Returns**

- `Promise<OperationType>`: A promise resolving to the type of the operation (`OperationType.PENDING`, `OperationType.NORMAL`, `OperationType.ROLLBACK`, `OperationType.UNKNOWN`).

**Throws**

- `OperationFetchError`: If the operation type cannot be fetched from any Lite Sequencer endpoint.

```ts
// Assuming 'tracker' is an initialized OperationTracker instance
// Assuming 'opId' holds a valid operation ID
const opId = '...'; 

async function logOperationType() {
  try {
    const opType = await tracker.getOperationType(opId);
    console.log(`Operation Type for ${opId}:`, opType);
  } catch (error) {
    console.error('Error fetching operation type:', error);
  }
}

logOperationType();
```

#### `getOperationId`

Retrieves the unique Operation ID associated with a specific TON-side transaction, identified by its `TransactionLinker`.

**Parameters**

- `transactionLinker` (TransactionLinker): The object returned by `TacSdk.sendCrossChainTransaction`, containing `shardsKey`, `caller`, `shardCount`, and `timestamp`.

**Returns**

- `Promise<string>`: A promise resolving to the unique Operation ID. Returns an empty string (`''`) if the operation is not found (e.g., not yet processed by the sequencer), but doesn't throw an error in that specific case.

**Throws**

- `OperationFetchError`: If there's a network error or the sequencer cannot be reached after checking all endpoints.

```ts
import { TransactionLinker } from '@tonappchain/sdk';
// Assuming 'tracker' is an initialized OperationTracker instance
// Assuming 'txLinker' is a valid TransactionLinker object obtained from sendCrossChainTransaction

const txLinker: TransactionLinker = {
  shardsKey: '...', 
  caller: 'UQ...',
  shardCount: 1,
  timestamp: 1678886400, // Example timestamp
  sendTransactionResult: { /* ... result from sender ... */ }
};

async function logOperationId() {
  try {
    const opId = await tracker.getOperationId(txLinker);
    if (opId) {
      console.log('Operation ID found:', opId);
    } else {
      console.log('Operation ID not found yet.');
    }
  } catch (error) {
    console.error('Error fetching operation ID:', error);
  }
}

logOperationId();
```

#### `getOperationIdsByShardsKeys`

Retrieves multiple Operation IDs based on a list of `shardsKey` values and the caller address. Useful for batch lookups.

**Parameters**

- `shardsKeys` (string[]): An array of `shardsKey` strings obtained from `TransactionLinker` objects.
- `caller` (string): The TON address of the sender for these operations.

**Returns**

- `Promise<OperationIdsByShardsKey>`: A promise resolving to an object mapping each provided `shardsKey` to its corresponding Operation ID (or `null` if not found).

**Throws**

- `OperationFetchError`: If the operation IDs cannot be fetched from any Lite Sequencer endpoint.

```ts
// Assuming 'tracker' is an initialized OperationTracker instance
const keysToLookup = ['key1...', 'key2...'];
const senderAddress = 'UQ...';

async function logMultipleOperationIds() {
  try {
    const opIdMap = await tracker.getOperationIdsByShardsKeys(keysToLookup, senderAddress);
    console.log('Operation IDs by Shards Key:', opIdMap);
    // Example: { 'key1...': 'opId123', 'key2...': null } 
  } catch (error) {
    console.error('Error fetching multiple operation IDs:', error);
  }
}

logMultipleOperationIds();
```

#### `getStageProfiling`

Retrieves detailed timing and status information for each stage of a single cross-chain operation.

**Parameters**

- `operationId` (string): The unique identifier for the operation.

**Returns**

- `Promise<ExecutionStages>`: A promise resolving to an object detailing the execution stages (e.g., `TACReceive`, `TACEvmExecution`, `TONFinalize`) with their status and timestamps.

**Throws**

- `ProfilingFetchError`: If profiling data cannot be fetched.
- `Error`: If no profiling data is found for the given `operationId` in the response.

```ts
// Assuming 'tracker' is an initialized OperationTracker instance
// Assuming 'opId' holds a valid operation ID
const opId = 'opId123...'; 

async function logStageProfiling() {
  try {
    const stages = await tracker.getStageProfiling(opId);
    console.log(`Stage Profiling for ${opId}:`, stages);
  } catch (error) {
    console.error('Error fetching stage profiling:', error);
  }
}

logStageProfiling();
```

#### `getStageProfilings`

Retrieves detailed timing and status information for each stage of multiple cross-chain operations in a single batch request.

**Parameters**

- `operationIds` (string[]): An array of unique operation identifiers.

**Returns**

- `Promise<ExecutionStagesByOperationId>`: A promise resolving to an object mapping each provided `operationId` to its corresponding `ExecutionStages` details.

**Throws**

- `EmptyArrayError`: If the `operationIds` array is empty or null.
- `ProfilingFetchError`: If profiling data cannot be fetched from any Lite Sequencer endpoint.

```ts
// Assuming 'tracker' is an initialized OperationTracker instance
const opIdsToProfile = ['opId123...', 'opId456...']; 

async function logMultipleStageProfilings() {
  try {
    const profilingsMap = await tracker.getStageProfilings(opIdsToProfile);
    console.log('Stage Profilings by Operation ID:', profilingsMap);
    // Example: { 'opId123...': { /* stages */ }, 'opId456...': { /* stages */ } }
  } catch (error) {
    console.error('Error fetching multiple stage profilings:', error);
  }
}

logMultipleStageProfilings();
```

#### `getOperationStatuses`

Retrieves the current status information for multiple cross-chain operations in a single batch request.

**Parameters**

- `operationIds` (string[]): An array of unique operation identifiers.

**Returns**

- `Promise<StatusInfosByOperationId>`: A promise resolving to an object mapping each provided `operationId` to its corresponding `StatusInfo` (which includes status, timestamps, transaction hashes, etc.).

**Throws**

- `EmptyArrayError`: If the `operationIds` array is empty or null.
- `StatusFetchError`: If status data cannot be fetched from any Lite Sequencer endpoint.

```ts
// Assuming 'tracker' is an initialized OperationTracker instance
const opIdsToGetStatus = ['opId123...', 'opId456...']; 

async function logMultipleStatuses() {
  try {
    const statusesMap = await tracker.getOperationStatuses(opIdsToGetStatus);
    console.log('Statuses by Operation ID:', statusesMap);
    // Example: { 'opId123...': { status: '...', txHash: '...' }, ... }
  } catch (error) {
    console.error('Error fetching multiple statuses:', error);
  }
}

logMultipleStatuses();
```

#### `getOperationStatus`

Retrieves the current status information for a single cross-chain operation.

**Parameters**

- `operationId` (string): The unique identifier for the operation.

**Returns**

- `Promise<StatusInfo>`: A promise resolving to the `StatusInfo` object for the given operation.

**Throws**

- `StatusFetchError`: If status data cannot be fetched or if the specific `operationId` is not found in the response from the sequencer.

```ts
// Assuming 'tracker' is an initialized OperationTracker instance
// Assuming 'opId' holds a valid operation ID
const opId = 'opId123...';

async function logSingleStatus() {
  try {
    const statusInfo = await tracker.getOperationStatus(opId);
    console.log(`Status for ${opId}:`, statusInfo);
  } catch (error) {
    console.error('Error fetching status:', error);
  }
}

logSingleStatus();
```

#### `getSimplifiedOperationStatus`

Provides a high-level, simplified status for a cross-chain operation based on its `TransactionLinker`. It first attempts to find the Operation ID and then determines if the operation is Pending, Successful, Failed, or Not Found.

**Parameters**

- `transactionLinker` (TransactionLinker): The object returned by `TacSdk.sendCrossChainTransaction`.

**Returns**

- `Promise<SimplifiedStatuses>`: A promise resolving to one of the enum values: 
  - `SimplifiedStatuses.OPERATION_ID_NOT_FOUND`
  - `SimplifiedStatuses.PENDING`
  - `SimplifiedStatuses.SUCCESSFUL`
  - `SimplifiedStatuses.FAILED`

**Throws**

- Can throw `OperationFetchError` if fetching the Operation ID or Operation Type fails beyond the initial check.

```ts
import { TransactionLinker, SimplifiedStatuses } from '@tonappchain/sdk';
// Assuming 'tracker' is an initialized OperationTracker instance
// Assuming 'txLinker' is a valid TransactionLinker object

const txLinker: TransactionLinker = {
  shardsKey: '...', 
  caller: 'UQ...',
  shardCount: 1,
  timestamp: 1678886400, // Example timestamp
  sendTransactionResult: { /* ... result from sender ... */ }
};

async function logSimplifiedStatus() {
  try {
    const simplifiedStatus = await tracker.getSimplifiedOperationStatus(txLinker);
    console.log('Simplified Status:', simplifiedStatus);

    switch (simplifiedStatus) {
      case SimplifiedStatuses.SUCCESSFUL:
        console.log('Operation completed successfully!');
        break;
      case SimplifiedStatuses.PENDING:
        console.log('Operation is pending.');
        break;
      case SimplifiedStatuses.FAILED:
        console.log('Operation failed (rolled back).');
        break;
      case SimplifiedStatuses.OPERATION_ID_NOT_FOUND:
        console.log('Operation ID not found yet, might still be processing.');
        break;
    }
  } catch (error) {
    console.error('Error fetching simplified status:', error);
  }
}

logSimplifiedStatus();
``` 

### Senders

Senders are responsible for signing and broadcasting the TON-side transactions generated by the SDK. The SDK uses the `SenderAbstraction` interface to allow different sending mechanisms.

#### `SenderAbstraction` (Interface)

Defines the contract for any object that can send transactions for the TacSdk.

**Purpose**

- Provides a consistent way for `TacSdk.sendCrossChainTransaction` to interact with different wallet implementations (like TonConnect or a raw private key).

**Methods**

- `sendShardTransaction(shardTransaction: ShardTransaction, delay: number, chain?: Network, contractOpener?: ContractOpener): Promise<unknown>`:
  - Takes a prepared `ShardTransaction` (containing messages, value, destination) and sends it.
  - `delay`: A delay (in seconds) to wait before performing operations, used to avoid rate limits.
  - `chain` (Network, optional): The target network.
  - `contractOpener` (ContractOpener, optional): Needed by some senders (like `RawSender`) to interact with the wallet contract.
  - Returns a promise that resolves with the result of the send operation (the specific type depends on the implementation, e.g., `SendTransactionResponse` for TonConnect).
- `getSenderAddress(): string`:
  - Returns the TON address of the wallet associated with the sender.

**Usage**

You typically don't interact with this interface directly, but rather use one of its implementations (`TonConnectSender` or `RawSender`), often created via `SenderFactory`.

#### `TonConnectSender`

An implementation of `SenderAbstraction` that uses the TonConnect UI library to propose transactions to the user's connected wallet (e.g., Tonkeeper, OpenMask).

**Purpose**

- Integrates with the standard TonConnect flow, allowing users to confirm transactions securely in their preferred wallet app.

**Constructor**

- `constructor(tonConnect: TonConnectUI)`: Takes an initialized `TonConnectUI` instance as input.

**Methods**

- `sendShardTransaction(...)`: Implements the interface method by formatting the transaction request and calling `tonConnect.sendTransaction()`. Returns `Promise<SendTransactionResponse>` from `@tonconnect/sdk`.
- `getSenderAddress()`: Implements the interface method by returning the address from the connected `tonConnect` instance.

```ts
import { TonConnectUI } from '@tonconnect/ui';
import { TonConnectSender, TacSdk, Network } from '@tonappchain/sdk';

// 1. Initialize TonConnectUI (refer to TonConnect documentation)
const tonConnectUI = new TonConnectUI({
    manifestUrl: 'https://<YOUR_APP_URL>/tonconnect-manifest.json',
    buttonRootId: 'ton-connect-button' // Example ID
});

// Wait for connection if necessary
// await tonConnectUI.connectWallet();

// 2. Create the sender
const sender = new TonConnectSender(tonConnectUI);

// 3. Use the sender with TacSdk
async function main() {
  const sdk = await TacSdk.create({ network: Network.TESTNET });
  const evmProxyMsg = { /* ... your EVM message ... */ };

  if (sender.getSenderAddress()) { // Check if wallet is connected
    const txLinker = await sdk.sendCrossChainTransaction(evmProxyMsg, sender);
    console.log('Transaction sent via TonConnect, Linker:', txLinker);
  } else {
    console.log('Please connect wallet first.');
  }
}

main(); 
```

#### `RawSender`

An implementation of `SenderAbstraction` that sends transactions directly using a raw private key. This is suitable for backend applications or testing where user interaction via TonConnect is not possible or desired.

**Purpose**

- Allows programmatic sending of transactions without user confirmation prompts.
- Requires direct access to the wallet's private key.

**Constructor**

- `constructor(wallet: WalletInstance, secretKey: Buffer)`:
  - `wallet` (WalletInstance): An instance of a wallet contract conforming to the `WalletInstance` interface defined in `SenderAbstraction.ts` (typically an instance of a wallet contract class from `@ton/ton`, like `WalletContractV4`, created with the corresponding public key).
  - `secretKey` (Buffer): The raw private key corresponding to the wallet.

**Methods**

- `sendShardTransaction(...)`: Implements the interface method by fetching the wallet's sequence number (`seqno`), preparing the internal messages, and calling the wallet contract's `sendTransfer` method with the secret key. Returns `Promise<void>`.
- `getSenderAddress()`: Implements the interface method by returning the address of the provided `wallet` instance.

**Security Note:** Handling raw private keys requires extreme care. Never expose them in client-side code.

```ts
import { mnemonicToWalletKey } from 'ton-crypto';
import { WalletContractV4 } from '@ton/ton';
import { RawSender, SenderFactory, TacSdk, Network, WalletVersion } from '@tonappchain/sdk';

// WARNING: Never hardcode mnemonics in production code. Use environment variables or secure config management.
const mnemonic = process.env.YOUR_MNEMONIC; // Example: load from environment
const network = Network.TESTNET;

async function main() {
  if (!mnemonic) {
    console.error('Mnemonic not found. Set YOUR_MNEMONIC environment variable.');
    return;
  }

  // 1. Create the sender (using SenderFactory is often easier, see below)
  const keyPair = await mnemonicToWalletKey(mnemonic.split(' '));
  const workchain = 0; // Usually 0
  const wallet = WalletContractV4.create({ workchain, publicKey: keyPair.publicKey });
  const sender = new RawSender(wallet, keyPair.secretKey);
  
  // Or using SenderFactory (Recommended for RawSender creation):
  // const sender = await SenderFactory.getSender({
  //   network: network,
  //   version: 'V4', // Specify your wallet version
  //   mnemonic: mnemonic 
  // });

  console.log('Using sender address:', sender.getSenderAddress());

  // 2. Use the sender with TacSdk
  const sdk = await TacSdk.create({ network });
  const evmProxyMsg = { /* ... your EVM message ... */ };

  try {
    const txLinker = await sdk.sendCrossChainTransaction(evmProxyMsg, sender);
    console.log('Transaction sent via RawSender, Linker:', txLinker);
  } catch (error) {
    console.error('Failed to send raw transaction:', error);
  }
}

main();
```

#### `SenderFactory`

A utility class to simplify the creation of `SenderAbstraction` instances.

**Purpose**

- Provides a single static method (`getSender`) to create either a `TonConnectSender` or a `RawSender` based on the provided parameters.
- Handles the complexity of deriving keys and creating the correct wallet contract instance for `RawSender`.

**Static Methods**

- `static async getSender(params): Promise<SenderAbstraction>`:
  - Takes a `params` object which can be one of two types:
    1.  `{ tonConnect: TonConnectUI }`: If a `TonConnectUI` instance is provided, it returns a `TonConnectSender`.
    2.  `{
          network: Network;
          version: WalletVersion;
          mnemonic: string;
          options?: { /* wallet-specific options */ };
        }`: If network, wallet version, and mnemonic are provided, it derives the keys, creates the appropriate `WalletInstance` (handling different versions), and returns a configured `RawSender`.
        - `WalletVersion`: A string literal type specifying the wallet contract version:
          - `'V2R1'`, `'V2R2'`: TON wallet contract v2 (older versions)
          - `'V3R1'`, `'V3R2'`: TON wallet contract v3
          - `'V4'`: Most common TON wallet contract version
          - `'V5R1'`: Newer version with subwallet support
          - `'HIGHLOAD_V3'`: Special version for high-load scenarios
        - `options`: Optional parameters specific to certain wallet versions:
          - For V5R1: `{ v5r1: { subwalletNumber?: number } }`
          - For HIGHLOAD_V3: `{ highloadV3: { subwalletId?: number, timeout?: number } }`

**Returns**

- `Promise<SenderAbstraction>`: A promise resolving to the created sender instance (`TonConnectSender` or `RawSender`).

**Throws**

- `UnknownWalletError`: If an unsupported `WalletVersion` is provided for RawSender creation.
- Errors from `mnemonicToWalletKey` if the mnemonic is invalid.

```ts
import { TonConnectUI } from '@tonconnect/ui';
import { SenderFactory, Network, WalletVersion } from '@tonappchain/sdk';

async function createSenders() {
  // Example 1: Creating a TonConnectSender
  const tonConnectUI = new TonConnectUI({ /* ... manifest ... */ });
  const tcSender = await SenderFactory.getSender({ tonConnect: tonConnectUI });
  console.log('TonConnectSender created. Address:', tcSender.getSenderAddress());

  // Example 2: Creating a RawSender (V4 wallet)
  const mnemonic = process.env.YOUR_MNEMONIC_V4; 
  if (mnemonic) {
    const rawSenderV4 = await SenderFactory.getSender({
      network: Network.TESTNET,
      version: 'V4', 
      mnemonic: mnemonic
    });
    console.log('RawSender (V4) created. Address:', rawSenderV4.getSenderAddress());
  } else {
    console.warn('Skipping RawSender V4 example: YOUR_MNEMONIC_V4 not set.');
  }
  
  // Example 3: Creating a RawSender (Highload V3 wallet with options)
  const hlMnemonic = process.env.YOUR_MNEMONIC_HL;
  if (hlMnemonic) {
    const rawSenderHL = await SenderFactory.getSender({
      network: Network.TESTNET,
      version: 'HIGHLOAD_V3', 
      mnemonic: hlMnemonic,
      options: {
        highloadV3: { subwalletId: 123, timeout: 60000 }
      }
    });
    console.log('RawSender (Highload) created. Address:', rawSenderHL.getSenderAddress());
  } else {
     console.warn('Skipping RawSender Highload example: YOUR_MNEMONIC_HL not set.');
  }
}

createSenders();
``` 

### Utilities and Helpers

This section describes utility functions and interfaces exported by the SDK.

#### `startTracking`

Polls the Lite Sequencer via `OperationTracker` to track the progress of a cross-chain operation initiated by `sendCrossChainTransaction`. It logs the status updates to the console and optionally returns the final execution stages.

**Purpose**

- Provides a simple way to monitor a cross-chain operation from initiation to completion or failure directly in a script or command-line tool.
- Displays detailed stage profiling information upon completion.

**Parameters**

- `transactionLinker` (TransactionLinker): The linker object returned by `sendCrossChainTransaction`.
- `network` (Network): The network the transaction was sent on.
- `options` (object, optional): Configuration options:
  - `customLiteSequencerEndpoints` (string[], optional): Override default Lite Sequencer endpoints.
  - `delay` (number, optional): Delay in seconds between polling attempts. Default: `10`.
  - `maxIterationCount` (number, optional): Maximum number of polling attempts before timing out. Default: `180` (from `MAX_ITERATION_COUNT`).
  - `returnValue` (boolean, optional): If `true`, the function returns the `ExecutionStages` object upon completion instead of just logging. Default: `false`.
  - `tableView` (boolean, optional): If `true` (and `returnValue` is `false`), displays the final execution stages in a formatted console table with columns for Stage, Exists, Success, Timestamp, Transactions, and various note fields. Default: `true`.

**Returns**

- `Promise<void | ExecutionStages>`: 
  - If `options.returnValue` is `false` (default), returns `Promise<void>`.
  - If `options.returnValue` is `true`, returns `Promise<ExecutionStages>` containing the detailed stage profiling data upon successful completion.

**Throws**

- Errors from `OperationTracker` if fetching data fails repeatedly.
- `Error`: If `options.returnValue` is `true` and the tracking times out due to `maxIterationCount` being reached.

```ts
import { startTracking, TacSdk, SenderFactory, Network } from '@tonappchain/sdk';

// Assuming txLinker is obtained from a previous sendCrossChainTransaction call
// const txLinker = await sdk.sendCrossChainTransaction(...);

async function trackMyTransaction(txLinker: TransactionLinker) {
  if (!txLinker) {
    console.log("Transaction Linker is required.");
    return;
  }

  console.log("Starting tracking with console logs...");
  await startTracking(txLinker, Network.TESTNET); // Default: logs to console

  console.log("\nStarting tracking to get return value...");
  try {
    const executionStages = await startTracking(txLinker, Network.TESTNET, {
      returnValue: true,
      delay: 5, // Check every 5 seconds
    });
    console.log("Tracking complete. Final Stages:", executionStages);
    // Process the executionStages object
  } catch (error) {
    console.error("Tracking failed or timed out:", error);
  }
}

// Example placeholder for txLinker (replace with actual linker)
const placeholderLinker = {
  shardsKey: '...', caller: 'UQ...', shardCount: 1, timestamp: Date.now() / 1000,
  sendTransactionResult: {}
}

trackMyTransaction(placeholderLinker);
```

#### `ContractOpener` (Interface)

This interface defines a standard way for the SDK to interact with TON blockchain contracts. It abstracts the underlying connection mechanism.

**Purpose**

- Allows the SDK (`TacSdk.create`) to use different connection methods (HTTP API, LiteServer, Sandbox) consistently.
- Enables users to provide custom connection logic if needed.

**Interface Methods**

- `open<T extends Contract>(contract: T): T`: Takes a contract instance (e.g., from `@ton/ton`) and returns a version of it bound to the opener's provider/client, allowing interaction.
- `getContractState(address: Address | string): Promise<{ balance: bigint; state: 'active' | 'uninitialized' | 'frozen'; code: Buffer | null; }>`: Retrieves the basic state (balance, status, code hash) of a contract at the given address.
- `closeConnections?: () => unknown`: An optional method that specific openers (like `liteClientOpener`) implement to close underlying network connections.

**Usage**

An object implementing this interface is required by `TacSdk.create`. It can be passed within the optional `TONParams` object. If not provided, `TacSdk.create` defaults to using `orbsOpener4`.

```ts
import { TacSdk, Network, orbsOpener4, TONParams } from '@tonappchain/sdk';

async function initializeSdkWithOpener() {
  // Get an opener instance (or create a custom one)
  const contractOpener = await orbsOpener4(Network.TESTNET);

  const tonParams: TONParams = {
    contractOpener: contractOpener
  };

  const sdk = await TacSdk.create({
    network: Network.TESTNET,
    TONParams: tonParams
  });

  console.log('SDK initialized with specific contract opener.');
  // Remember to close connections if applicable
  // contractOpener.closeConnections?.(); 
}

initializeSdkWithOpener();
```

#### Contract Opener Functions (`orbsOpener4`, etc.)

These are factory functions that return an object conforming to the `ContractOpener` interface, each using a different method to connect to the TON network.

- **`orbsOpener4(network: Network, timeout?: number): Promise<ContractOpener>`**: 
  - Uses `@ton/ton`'s `TonClient4` and Orbs Network's public HTTP v4 endpoints (`@orbs-network/ton-access`).
  - **This is the default opener used by `TacSdk.create`**.
  - Recommended for most web/backend applications.
  ```ts
  import { orbsOpener4, Network } from '@tonappchain/sdk';
  
  async function getOpener() {
    const opener = await orbsOpener4(Network.TESTNET);
    // Use this opener when creating TacSdk instance
    // const sdk = await TacSdk.create({ network: Network.TESTNET, TONParams: { contractOpener: opener } });
    console.log('Orbs Opener (v4) created');
    // Remember to close connections if the opener supports it (orbsOpener4 currently doesn't expose it)
    // opener.closeConnections?.(); 
  }
  getOpener();
  ```

- **`liteClientOpener(options: { liteservers: LiteServer[] } | { network: Network }): Promise<ContractOpener>`**:
  - Uses `@tonappchain/ton-lite-client` to connect directly to specified TON LiteServers.
  - Requires providing an array of `liteservers` objects or a `network` to fetch default servers.
  - Useful if you need direct LiteServer access or want to avoid reliance on public HTTP APIs.
  - Exposes a `closeConnections()` method that should be called when done.
  ```ts
  import { liteClientOpener, Network } from '@tonappchain/sdk';
  
  async function getLiteOpener() {
    // Option 1: Use default servers for the network
    const openerFromNetwork = await liteClientOpener({ network: Network.TESTNET });
    console.log('Lite Client Opener created (default servers)');
    openerFromNetwork.closeConnections(); // Important: Close connections when done

    // Option 2: Specify custom LiteServers (structure depends on source)
    // const customServers = [{ ip: ..., port: ..., id: { key: '...' } }];
    // const openerCustom = await liteClientOpener({ liteservers: customServers });
    // openerCustom.closeConnections();
  }
  getLiteOpener();
  ```

- **`sandboxOpener(blockchain: Blockchain): ContractOpener`**:
  - Uses `@ton/sandbox`'s `Blockchain` instance.
  - Specifically designed for local development and testing environments using the sandbox.
  ```ts
  import { Blockchain } from '@ton/sandbox';
  import { sandboxOpener } from '@tonappchain/sdk';
  
  async function getSandboxOpener() {
    const blockchain = await Blockchain.create(); // Initialize sandbox
    const opener = sandboxOpener(blockchain);
    console.log('Sandbox Opener created');
    // Use with TacSdk in tests
    // const sdk = await TacSdk.create({ network: Network.TESTNET, TONParams: { contractOpener: opener } });
  }
  getSandboxOpener();
  ```

- **`orbsOpener(network: Network): Promise<ContractOpener>`**: 
  - Uses `@ton/ton`'s `TonClient` (older version compared to TonClient4) and Orbs Network's public HTTP endpoints.
  - `orbsOpener4` is generally preferred now.

### Key Enums and Types

This section describes important enums and data structures used throughout the SDK.

#### Enums

- **`Network`**: Specifies the target blockchain network.
  - `TESTNET = 'testnet'`
  - `MAINNET = 'mainnet'`

- **`SimplifiedStatuses`**: High-level statuses for cross-chain operations.
  - `PENDING = 'PENDING'`
  - `FAILED = 'FAILED'`
  - `SUCCESSFUL = 'SUCCESSFUL'`
  - `OPERATION_ID_NOT_FOUND = 'OPERATION_ID_NOT_FOUND'`

- **`OperationType`**: Detailed operation types from the Lite Sequencer.
  - `PENDING = 'PENDING'`
  - `TON_TAC_TON = 'TON-TAC-TON'`
  - `ROLLBACK = 'ROLLBACK'`
  - `TON_TAC = 'TON-TAC'`
  - `TAC_TON = 'TAC-TON'`
  - `UNKNOWN = 'UNKNOWN'`

- **`StageName`**: Identifiers for the different stages tracked in `ExecutionStages`.
  - `COLLECTED_IN_TAC = 'collectedInTAC'`
  - `INCLUDED_IN_TAC_CONSENSUS = 'includedInTACConsensus'`
  - `EXECUTED_IN_TAC = 'executedInTAC'`
  - `COLLECTED_IN_TON = 'collectedInTON'`
  - `INCLUDED_IN_TON_CONSENSUS = 'includedInTONConsensus'`
  - `EXECUTED_IN_TON = 'executedInTON'`

#### Core Data Structures

- **`AssetBridgingData`**: Used in `TacSdk.sendCrossChainTransaction` to specify assets (TON or Jettons) to bridge. It's a union type:
  - `RawAssetBridgingData`: `{ address?: string; rawAmount: bigint; }` - Requires the amount in the smallest indivisible units.
  - `UserFriendlyAssetBridgingData`: `{ address?: string; amount: number; decimals?: number; }` - Allows specifying a human-readable amount. The SDK will attempt to fetch decimals from the chain if not provided and convert `amount` to `rawAmount`.
  - `address` (string, optional): The TON Jetton master address. If omitted or set to `sdk.nativeTONAddress` (`'NONE'`), it signifies native TON coin.

- **`EvmProxyMsg`**: Defines the target EVM call details for `TacSdk.sendCrossChainTransaction`.
  - `evmTargetAddress` (string): The address of the contract to call on the TAC chain.
  - `methodName` (string, optional): The Solidity method signature (e.g., `"transfer(address,uint256)"`). Required if `encodedParameters` is not provided.
  - `encodedParameters` (string, optional): The ABI-encoded parameters for the method call (e.g., `"0x..."`). Required if `methodName` is not provided.
  - `gasLimit` (bigint, optional): Gas limit for the TAC-side transaction. If omitted or `0n`, the SDK attempts to estimate it using `simulateTACMessage`.

- **`TransactionLinker`**: Object returned by `TacSdk.sendCrossChainTransaction` and used by `OperationTracker` to identify and track an operation.
  - `caller` (string): The TON address that initiated the transaction.
  - `shardCount` (number): The number of TON messages sent (usually 1, but can be more if bridging multiple different Jettons).
  - `shardsKey` (string): A unique key identifying the set of TON messages belonging to this operation.
  - `timestamp` (number): The Unix timestamp (seconds) when the linker was generated.
  - `sendTransactionResult` (unknown, optional): The raw result returned by the underlying `SenderAbstraction`'s `sendShardTransaction` method.

- **`UserWalletBalanceExtended`**: Detailed balance info returned by `TacSdk.getUserJettonBalanceExtended`.
  - `{ exists: true; amount: number; rawAmount: bigint; decimals: number; }`: If the Jetton contract exists and balance is retrieved.
  - `{ exists: false; }`: If the Jetton contract doesn't exist or is inactive.

- **`SDKParams`**: Configuration object for `TacSdk.create`.
  - `network` (Network): Required (`MAINNET` or `TESTNET`).
  - `delay` (number, optional): Delay between TON reads (seconds). Default: `1.5`.
  - `TONParams` (TONParams, optional): See below.
  - `TACParams` (TACParams, optional): See below.
  - `customLiteSequencerEndpoints` (string[], optional): Override default sequencer URLs.

- **`TONParams`**: Optional TON-specific parameters within `SDKParams`.
  - `contractOpener` (ContractOpener, optional): Custom contract opener. Default: `orbsOpener4`.
  - `settingsAddress` (string, optional): Override default TON Settings contract address (for testing).

- **`TACParams`**: Optional TAC-specific parameters within `SDKParams` (mainly for advanced/testing scenarios).
  - `provider` (AbstractProvider, optional): Custom ethers.js provider for TAC.
  - `settingsAddress` (string | Addressable, optional): Override TAC Settings address.
  - `settingsABI` (Interface | InterfaceAbi, optional): Override TAC Settings ABI.
  - `crossChainLayerABI` (Interface | InterfaceAbi, optional): Override TAC CrossChainLayer ABI.
  - `crossChainLayerTokenABI` (Interface | InterfaceAbi, optional): Override TAC CrossChainLayerToken ABI.
  - `crossChainLayerTokenBytecode` (string, optional): Override TAC CrossChainLayerToken bytecode.

#### Simulation & Tracking Structures

- **`TACSimulationRequest`**: Input object for `TacSdk.simulateTACMessage`.
  - `tonCaller` (string): Initiating TON address.
  - `shardsKey` (string): From `