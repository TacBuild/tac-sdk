
# SDK Data Structures (Structs)

This file documents the primary data structures (types and interfaces often referred to as structs) used for configuration, data transfer, and results within the TAC SDK.

## Table of Contents

### Core Configuration
- [`SDKParams`](#sdkparams-type)
- [`TONParams`](#tonparams-type)
- [`TACParams`](#tacparams-type)

### Contract Openers
- [`ContractState`](#contractstate-type)
- [`ContractOpener`](#contractopener-interface)
- [`RetryableContractOpener`](#retryablecontractopener-class)

### Crosschain Transaction
- [`EvmProxyMsg`](#evmproxymsg-type)
- [`CrossChainTransactionOptions`](#crosschaintransactionoptions)
- [`CrosschainTx`](#crosschaintx)
### Transaction Tracking
- [`TransactionLinker`](#transactionlinker-type)
- [`TransactionLinkerWithOperationId`](#transactionlinkerwithoperationid-type)
- [`OperationIds`](#operationids-type)
- [`OperationIdsByShardsKey`](#operationidsbyshardskey-type)

### Simulation Structures
- [`TACSimulationRequest`](#tacsimulationrequest)
- [`TACSimulationResult`](#tacsimulationresult)
- [`ExecutionFeeEstimationResult`](#executionfeeestimationresult)
- [`SuggestedTONExecutorFee`](#suggestedtonexecutorfee)

### Execution & Status
- [`TransactionData`](#transactiondata)
- [`NoteInfo`](#noteinfo)
- [`FeeParams`](#feeparams)
- [`StageData`](#stagedata)
- [`StatusInfo`](#statusinfo)
- [`ProfilingStageData`](#profilingstagedata)
- [`ExecutionStages`](#executionstages)
- [`ExecutionStagesByOperationId`](#executionstagesbyoperationid)
- [`StatusInfosByOperationId`](#statusinfosbyoperationid)
- [`WaitOptions`](#waitoptions-interface)

### Metadata & Fees
- [`MetaInfo`](#metainfo)
- [`InitialCallerInfo`](#initialcallerinfo)
- [`ValidExecutors`](#validexecutors)
- [`GeneralFeeInfo`](#generalfeeinfo)
- [`FeeInfo`](#feeinfo)

### Jetton Wallet
- [`UserWalletBalanceExtended`](#userwalletbalanceextended)

### NFT
- [`NFTItemData`](#nftitemdata)
- [`NFTCollectionData`](#nftcollectiondata)

---

## Core Data Structures

These structs are fundamental for configuring the SDK and initiating cross-chain transactions.

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
- **`delay`** (optional): Delay in milliseconds between retry attempts when querying TON via the contract opener. Default is 0 ms.
- **`TACParams`** *(optional)*: Custom parameters for TAC side
- **`TONParams`** *(optional)*: Custom parameters for TON side
- **`customLiteSequencerEndpoints`** *(optional)*: Custom lite sequencer endpoints for API access.

### `TONParams (Type)`
```typescript
export type TONParams = {
    contractOpener?: IContractOpener;
    settingsAddress?: string;
}
```
TON Parameters for SDK:
- **`contractOpener`** (optional): Client used for TON smart contract interaction. Default is a RetryableContractOpener that combines TonClient (TAC endpoint), orbsOpener4, and orbsOpener as fallbacks. Provide your own opener primarily for tests or custom setups.
- **`settingsAddress`** (optional): TON settings contract address. Needed to retrieve protocol data. Set for tests only


### `TACParams (Type)`
```typescript
export type TACParams = {
    provider?: AbstractProvider;
    settingsAddress?: string | Addressable;  
}
```

TAC Parameters for SDK:
- **`provider`** *(optional)*: Provider used for TAC smart contract interaction. Set for increasing rate limit or tests only
- **`settingsAddress`** *(optional)*: TAC settings contract address. Needed to retrieve protocol data. Set for tests only


### `ContractState (Type)`

```typescript
export type ContractState = {
    balance: bigint;
    state: 'active' | 'uninitialized' | 'frozen';
    code: Buffer | null;
};
```

Represents the state of a TON smart contract:
- **`balance`**: The contract's balance in nanoTONs.
- **`state`**: The current state of the contract, which can be:
    - **`active`**: The contract is deployed and active.
    - **`uninitialized`**: The contract exists but has not been initialized.
    - **`frozen`**: The contract is frozen (inactive).
- **`code`**: The contract's code as a Buffer, or null if the contract has no code.

### `ContractOpener (Interface)`

```typescript
export interface ContractOpener {
    open<T extends Contract>(src: T): OpenedContract<T> | SandboxContract<T>;
    getContractState(address: Address): Promise<ContractState>;
    closeConnections?: () => unknown;
}
```

Interface for opening and interacting with TON smart contracts:
- **`open<T extends Contract>(src: T)`**: Opens a contract for interaction, returning an OpenedContract or SandboxContract instance.
- **`getContractState(address: Address)`**: Retrieves the state of a contract at the specified address.
- **`closeConnections?`** *(optional)*: Closes any open connections to the TON network.

### `RetryableContractOpener (Class)`

```typescript
export interface OpenerConfig {
    opener: ContractOpener;
    retries: number;
    retryDelay: number;
}

export class RetryableContractOpener implements ContractOpener {
    constructor(openerConfigs: OpenerConfig[]);
    open<T extends Contract>(src: T): OpenedContract<T> | SandboxContract<T>;
    getContractState(address: Address): Promise<ContractState>;
    closeConnections(): void;
}
```

A resilient implementation of IContractOpener that provides retry capabilities and fallback mechanisms when interacting with TON contracts.

#### **Constructor Parameters**
- **`openerConfigs`**: An array of `OpenerConfig` objects, each containing:
  - **`opener`**: A ContractOpener instance.
  - **`retries`**: Number of retry attempts for failed operations.
  - **`retryDelay`**: Delay in milliseconds between retry attempts.

#### **Methods**
- **`open<T extends Contract>(src: T)`**: Opens a contract with retry capabilities. If the primary opener fails, it will automatically retry using the configured retry policy.
- **`getContractState(address: Address)`**: Retrieves contract state with retry capabilities. If the primary opener fails, it will try alternative openers according to the configured retry policy.
- **`closeConnections()`**: Closes all connections across all configured openers.

#### **Helper Functions**
```typescript
export async function createDefaultRetryableOpener(
    artifacts: typeof testnet | typeof mainnet,
    maxRetries = 3,
    retryDelay = 1000,
): Promise<IContractOpener>
```

Creates a default RetryableContractOpener with multiple fallback providers:
- **`artifacts`**: Network artifacts (testnet or mainnet).
- **`maxRetries`** *(optional)*: Maximum number of retry attempts. Default is *3*.
- **`retryDelay`** *(optional)*: Delay in milliseconds between retry attempts. Default is *1000*.

Returns a RetryableContractOpener configured with:
1. TonClient by TAC (primary)
2. orbsOpener4 (first fallback)
3. orbsOpener (second fallback)

This function provides a convenient way to create a robust contract opener with sensible defaults for production use.


### `EvmProxyMsg (Type)`
```typescript
export type EvmProxyMsg = {
    evmTargetAddress: string,
    methodName?: string,
    encodedParameters?: string,
    gasLimit?: bigint,
    [key: string]: unknown;
}
```
Represents a proxy message to a TAC.
- **`evmTargetAddress`**: Target address on the EVM network.
- **`methodName`** *(optional)*: Method name to be called on the target contract. Either method name `MethodName` or signature `MethodName(bytes,bytes)` must be specified (strictly (bytes,bytes)).
- **`encodedParameters`** *(optional)*: Parameters for the method, encoded as a string.
- **`gasLimit`** *(optional)*: `gasLimit` is a parameter that will be passed on the TAC side. The executor must allocate at least gasLimit gas for executing the transaction on the TAC side. If this parameter is not specified, it will be calculated using the `simulateTACMessage` method(prefered).
- **`[key: string]`** *(optional)*: Additional parameters that can be used for customizing the EVM data cell builder. Attention, this may lead to unexpected behavior if not used correctly.

This structure defines the logic you want to execute on the TAC side. This message is sent along with all the sharded messages related to the jetton bridging, enabling the TAC to process the intended logic on the TAC side during the crosschain transaction.

### `CrossChainTransactionOptions`
An optional configuration object for customizing advanced crosschain transaction behavior.

```ts
export type CrossChainTransactionOptions = {
    allowSimulationError?: boolean;
    isRoundTrip?: boolean;
    protocolFee?: bigint;
    evmValidExecutors?: string[];
    evmExecutorFee?: bigint;
    tvmValidExecutors?: string[];
    tvmExecutorFee?: bigint;
    calculateRollbackFee?: boolean;
};
```

- **allowSimulationError** *(optional)*:  
  If true, transaction simulation phase is skipped.  
  **Default**: false

- **isRoundTrip** *(optional)*:  
  Indicates whether the transaction involves a round-trip execution (e.g., a return message from TAC to TON).  
  **Default**: will be determined by simulation. 

- **protocolFee** *(optional)*:  
  An optional override for the protocol fee in bigint. If not specified, the SDK calculates this automatically based on network parameters.

- **evmValidExecutors** *(optional)*:  
  A list of EVM executor addresses that are allowed to execute this transaction on the TAC.

- **evmExecutorFee** *(optional)*:  
  Fee in bigint to be paid (in TON token) to the executor on the EVM side for executing the transaction.

- **tvmValidExecutors** *(optional)*:  
  A list of TVM (TON) executor addresses that are authorized to execute the message on the TON network.

- **tvmExecutorFee** *(optional)*:  
  Fee in bigint to be paid (in TON token) to the executor on the TON side.



### `CrosschainTx`

```ts
export type CrosschainTx = {
    evmProxyMsg: EvmProxyMsg;
    assets?: Asset[];
    options?: CrossChainTransactionOptions;
};
```

Represents a crosschain transaction.
- **`evmProxyMsg`**: The message to be sent to the TAC proxy.
- **`assets`** *(optional)*: An array of assets involved in the transaction.
- **`options`** *(optional)*: Additional options for the transaction.


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

### `TransactionLinkerWithOperationId (Type)`

```typescript
export type TransactionLinkerWithOperationId = TransactionLinker & {
    operationId?: string;
};
```

This structure is extended version of `TransactionLinker` with `operationId` field that is retrieved automatically by `TacSDK` when sending crosschain transaction.

### `OperationIds (Type)`

```typescript
export type OperationIds = {
    operationIds: string[];
};
```

Contains a collection of operation identifiers for tracking multiple operations.

- **`operationIds`**: Array of operation ID strings for tracking crosschain operations.

### `OperationIdsByShardsKey (Type)`

```typescript
export type OperationIdsByShardsKey = Record<string, OperationIds>;
```

Maps shard keys to their corresponding operation IDs, allowing efficient lookup of operations by shard identifier.


### `TACSimulationRequest`

```typescript
export type TACSimulationRequest = {
    tacCallParams: {
        arguments: string;
        methodName: string;
        target: string;
    };
    evmValidExecutors?: string[];
    tvmValidExecutors?: string[];
    extraData?: string;
    shardsKey: string;
    tonAssets: {
        amount: string;
        tokenAddress: string;
        assetType: string;
    }[];
    tonCaller: string;
    calculateRollbackFee?: boolean;
};
```

Represents a request to simulate a TAC message.

- **`tacCallParams`**: An object containing parameters for the TAC call.
  - **`arguments`**: Encoded arguments for the TAC method.
  - **`methodName`**: Name of the method to be called on the target TAC contract.
  - **`target`**: The target address on the TAC network.
- **`evmValidExecutors`** *(optional)*: Valid executors for TAC. Default: `config.TACParams.trustedTACExecutors`.
- **`tvmValidExecutors`** *(optional)*: Valid executors for TON. Default: `config.TACParams.trustedTONExecutors`.
- **`extraData`** *(optional)*: Additional non-root data to be included in TAC call. Default: `"0x"`.
- **`shardsKey`**: Key identifying shards for the operation.
- **`tonAssets`**: An array of assets involved in the transaction.
  - **`amount`**: Amount of the asset to be transferred.
  - **`tokenAddress`**: Address of the token.
  - **`assetType`**: Type of the asset. Either fungible or non-fungible.
- **`tonCaller`**: Address of the caller in the TON.
- **`calculateRollbackFee`** *(optional)*: Whether to include rollback path fee in estimation. Default: `true`.

Note:
- When using SDK helpers (e.g., Simulator), if `tacCallParams.arguments` are omitted, they will be set to `"0x"`.
- `tacCallParams.methodName` is validated and normalized via `formatSolidityMethodName`.

### `ExecutionFeeEstimationResult`

```ts
export type ExecutionFeeEstimationResult = {
  feeParams: FeeParams;
  simulation?: TACSimulationResult;
}
```

#### **Description**

The result of a cross-chain transaction simulation, containing both the estimated fees and the outcome of the TAC-side message simulation.

#### **Fields**

- **`feeParams`**: [`FeeParams`](#feeparams)  

- **`simulation`**: [`TACSimulationResult`](#tacsimulationresult)  

#### **Purpose**

Used to pre-evaluate:
- whether the transaction will succeed on the TAC side,
- how much fee is required in the chosen asset.

Enables safe transaction previews before actual submission.

Here's your corrected structure documentation in the same format:

### `SuggestedTONExecutorFee`

```ts
export type SuggestedTONExecutorFee = {
  inTAC: string;
  inTON: string;
}
```

#### **Description**  
Contains estimated tvm executor fee for TON bridging operations in both TAC and TON denominations.

#### **Fields**  
- **`inTAC`**: Fee amount in TAC tokens
- **`inTON`**: Fee amount in TON tokens

#### **Purpose**  
Allows users to:
- Estimate costs before initiating transactions in both currencies 

### `TransactionData`

```typescript
export type TransactionData = {
    hash: string;
    blockchainType: BlockchainType;
};
```

Represents transaction details.
- **`hash`**: The hash of the transaction.
- **`blockchainType`**: The type of the blockchain (`TON` or `TAC`).

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

### `FeeParams`

```ts
export type FeeParams = {
    isRoundTrip: boolean,
    gasLimit: bigint,
    protocolFee: bigint,
    evmExecutorFee: bigint,
    tvmExecutorFee: bigint,
};
```

Represents the calculated fee parameters used for crosschain transaction execution.

- **`isRoundTrip`**:  
  Indicates whether the transaction is expected to perform a round-trip (e.g., from TAC to TON and back to TAC).

- **`gasLimit`**:  
  Estimated gas limit for the EVM-side transaction execution.

- **`protocolFee`**:  
  Fee charged by the protocol for facilitating the crosschain message.

- **`evmExecutorFee`**:  
  Fee (in TON) to be paid to the executor responsible for handling execution on the EVM side.

- **`tvmExecutorFee`**:  
  Fee (in TON) to be paid to the executor responsible for handling execution on the TON side.

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
    stage: StageName;
};
```

Combines `StageData` with an additional stage identifier.

- **`stage`**: Current stage in `StageName` enum.
- **Other Properties from `StageData`**

### `MetaInfo`

```ts
export type MetaInfo = {
    initialCaller: InitialCallerInfo;
    validExecutors: ValidExecutors;
    feeInfo: FeeInfo;
    sentAssets: AssetMovementInfo | null;
    receivedAssets: AssetMovementInfo | null;
};
```

Holds metadata associated with a crosschain transaction, including the initiating party, allowed executors, detailed fee information, and asset movement details.

- **`initialCaller`**:  
  Information about the original sender of the transaction, including address and source blockchain.

- **`validExecutors`**:  
  Specifies the list of executor addresses authorized to handle execution on TAC and TON.

- **`feeInfo`**:  
  Object containing detailed information about fees required for the transaction execution.

- **`sentAssets`**:  
  Information about assets sent in the transaction, including caller, target, transaction hash, and asset movements.

- **`receivedAssets`**:  
  Information about assets received in the transaction, including caller, target, transaction hash, and asset movements.


### `AssetMovementInfo`

```ts
export type AssetMovementInfo = {
    caller: InitialCallerInfo;
    target: InitialCallerInfo;
    transactionHash: TransactionHash;
    assetMovements: AssetMovement[];
};
```

Represents information about asset movements in a transaction.

- **`caller`**:  
  Information about the caller address and blockchain type.

- **`target`**:  
  Information about the target address and blockchain type.

- **`transactionHash`**:  
  The transaction hash and its blockchain type.

- **`assetMovements`**:  
  Array of individual asset movements in the transaction.


### `AssetMovement`

```ts
export type AssetMovement = {
    assetType: AssetType;
    tvmAddress: string;
    evmAddress: string;
    amount: string;
    tokenId: string | null;
};
```

Represents a single asset movement in a transaction.

- **`assetType`**:  
  The type of asset being moved (`FT` for fungible tokens, `NFT` for non-fungible tokens).

- **`tvmAddress`**:  
  The TVM (TON Virtual Machine) address of the asset.

- **`evmAddress`**:  
  The EVM (Ethereum Virtual Machine) address of the asset.

- **`amount`**:  
  The amount of the asset being moved as a string.

- **`tokenId`**:  
  The token ID for NFTs, or `null` for fungible tokens.


### `TransactionHash`

```ts
export type TransactionHash = {
    hash: string;
    blockchainType: BlockchainType;
};
```

Represents a transaction hash with its associated blockchain type.

- **`hash`**:  
  The transaction hash string.

- **`blockchainType`**:  
  The blockchain type (`TON` or `TAC`) where the transaction occurred.


### `InitialCallerInfo`

```ts
export type InitialCallerInfo = {
    address: string;
    blockchainType: BlockchainType;
};
```

Represents the originator of the transaction.

- **`address`**:  
  The address of the caller that initiated the crosschain transaction.

- **`blockchainType`**:  
  The blockchain network (`TON` or `TAC`) where the caller originated from.


### `ValidExecutors`

```ts
export type ValidExecutors = {
    tac: string[];
    ton: string[];
};
```

Specifies the set of executor addresses that are permitted to execute the transaction.

- **`tac`**:  
  A list of allowed executor addresses on the TAC (EVM) network.

- **`ton`**:  
  A list of allowed executor addresses on the TON network.

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
  operationType: OperationType;
  metaInfo: MetaInfo;
} & Record<StageName, ProfilingStageData>;

```

Represents the profiling data for all execution stages within an operation.
- [`StageName`](./enums.md#stagename)
- [`OperationType`](./enums.md#operationtype)

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

### `NFTItemData`

Provides information about NFT item.

```typescript
export type NFTItemData = {
    init: boolean;
    index: number;
    collectionAddress: Address;
    ownerAddress: Address | null;
    content: Cell | null;
};
```

- **`init`**: Indicates whether item is active, i.e initialized by NFT collection and has not been burnt
- **`index`**: Index of the item in collection
- **`collectionAddress`**: Address of collection
- **`ownerAddress`**: Address of the item owner
- **`content`**: Content(metadata) of the item

### `NFTCollectionData`

Provides information about NFT collection.

```typescript
export type NFTCollectionData = {
    nextIndex: number;
    content: Cell;
    adminAddress: Address;
};
```

- **`nextIndex`**: Next item index to be minted in the collection
- **`content`**: Content(metadata) of the collection
- **`adminAddress`**: Address of the collection admin

### `TACSimulationResult`

```typescript
export type TACSimulationResult = {
    estimatedGas: bigint;
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
      nftBurned: {
        amount: string;
        tokenAddress: string;
      }[];
      nftLocked: {
        amount: string;
        tokenAddress: string;
      }[];
    }[]
            | null;
    simulationError: string;
    simulationStatus: boolean;
    suggestedTonExecutionFee: string;
    suggestedTacExecutionFee: string;
    debugInfo: {
      from: string;
      to: string;
      callData: string;
      blockNumber: number;
    };
};
```
Provides TAC simulation results.

  - **`estimatedGas`**: The estimated gas required for the message.
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
    - **`nftBurned`**: The NFTs burned.
    - **`nftLocked`**: The NFTs locked.
  - **`simulationError`**: Any error encountered during the simulation.
  - **`simulationStatus`**: The status of the simulation.
  - **`suggestedTonExecutionFee`**: Suggested fee (in TON) that should be attached to ensure successful execution on the TON network. 
  - **`suggestedTacExecutionFee`**: Suggested fee (in TON) that should be attached to ensure successful execution on the TAC network.  
  - **`debugInfo`**: Debugging information.
    - **`from`**: The sender address.
    - **`to`**: The recipient address.
    - **`callData`**: The call data.
    - **`blockNumber`**: The block number.
---
### `GeneralFeeInfo`

```typescript
export type GeneralFeeInfo = {
    protocolFee: string;
    executorFee: string;
    tokenFeeSymbol: TokenSymbol;
};
```
Represents the fee structure for a blockchain protocol.
- **`protocolFee`**: The fee amount charged by the protocol itself.
- **`executorFee`**: The fee amount paid to the transaction executor.
- **`tokenFeeSymbol`**: The symbol/identifier of the [token](./enums.md#tokensymbol) used to pay fees.


### `AdditionalFeeInfo`

```ts
export type AdditionalFeeInfo = {
    attachedProtocolFee: string;
    tokenFeeSymbol: TokenSymbol;
};
```
Represents additional fee information attached to the transaction.

- **`attachedProtocolFee`**: The additional protocol fee amount attached to the transaction.
- **`tokenFeeSymbol`**: The symbol/identifier of the token used for the additional fee.


### `FeeInfo`

```ts
export type FeeInfo = {
    additionalFeeInfo: AdditionalFeeInfo;
    tac: GeneralFeeInfo;
    ton: GeneralFeeInfo;
};
```
Contains fee information for both TAC and TON blockchain networks, plus additional fee information.

- **`additionalFeeInfo`**: Additional fee information attached to the transaction.
- **`tac`**: Complete fee structure for transactions on the TAC blockchain.
- **`ton`**: Complete fee structure for transactions on the TON blockchain.

### `WaitOptions (Interface)`

```typescript
export interface WaitOptions<T = unknown> {
    timeout?: number;
    maxAttempts?: number;
    delay?: number;
    logger?: ILogger;
    successCheck?: (result: T) => boolean;
}
```

Allows to specify custom options for waiting for operation resolution.

- **`timeout`** *(optional)*: Timeout in milliseconds. Default is 300000 (5 minutes).
- **`maxAttempts`** *(optional)*: Maximum number of attempts. Default is 30.
- **`delay`** *(optional)*: Delay between attempts in milliseconds. Default is 10000 (10 seconds).
- **`logger`** *(optional)*: Logger used to output debug information during waiting.
- **`successCheck`** *(optional)*: Function to check if the result is successful. If not provided, any non-error result is considered successful.


---
### Address Aliases

```ts
export type TVMAddress = string;
export type EVMAddress = string;
```

Aliases for address strings used throughout the SDK:
- TVMAddress: TON Virtual Machine address in friendly/raw string form.
- EVMAddress: EVM-compatible checksum address string.


### Asset Creation Arguments

These helper types are used by factory methods (e.g., AssetFactory.from) to construct specific asset instances.

```ts
export type AssetFromFTArg = {
    address: TVMAddress | EVMAddress;
    tokenType: AssetType.FT;
};

export type AssetFromNFTItemArg = {
    address: TVMAddress;
    tokenType: AssetType.NFT;
    addressType: NFTAddressType.ITEM;
};

export type AssetFromNFTCollectionArg = {
    address: TVMAddress | EVMAddress;
    tokenType: AssetType.NFT;
    addressType: NFTAddressType.COLLECTION;
    index: bigint;
};
```

- AssetFromFTArg: Use for fungible tokens (Jettons). Address may be TVM or EVM.
- AssetFromNFTItemArg: Use for a specific NFT item. Address must be a TVM item address.
- AssetFromNFTCollectionArg: Use for an NFT item derived from a collection and an on-chain `index`. Address may be TVM or EVM collection address.


### Currency Conversion Types

Utilities for converting amounts and reporting price information.

```ts
export type ConvertCurrencyParams = {
    value: bigint;
    currency: CurrencyType;
};

export type USDPriceInfo = {
    spot: bigint;
    ema: bigint;
    decimals: number;
};

export type ConvertedCurrencyResult = {
    spotValue: bigint;
    emaValue: bigint;
    decimals: number;
    currency: CurrencyType;
    tacPrice: USDPriceInfo;
    tonPrice: USDPriceInfo;
};
```

- **ConvertCurrencyParams**: Input parameters to convert a raw bigint amount for the selected currency type.
- **USDPriceInfo**: Contains USD price information for a token with proper decimal handling:
  - **`spot`**: Current spot price in USD, represented as a bigint value multiplied by 10^decimals
  - **`ema`**: Exponential Moving Average price in USD, represented as a bigint value multiplied by 10^decimals  
  - **`decimals`**: Number of decimal places used in the price representation. Typically 18 for most tokens.
  
  **Price Format Example**: A price value of `3090143663312000000` with `decimals: 18` represents `3.090143663312` USD (the value divided by 10^18).

- **ConvertedCurrencyResult**: Contains conversion results with detailed price information:
  - **`spotValue`** & **`emaValue`**: Converted amounts using spot and EMA prices respectively
  - **`decimals`**: Decimal places for the converted values
  - **`currency`**: The currency type that was converted
  - **`tacPrice`** & **`tonPrice`**: Reference USD price information for TAC and TON tokens used in the conversion calculation


### WaitOptions Defaults

The SDK provides the following defaults (see `defaultWaitOptions` in the code):
- timeout: 300000 (5 minutes)
- maxAttempts: 30
- delay: 10000 (10 seconds)
