
# SDK Data Structures (Structs)

This file documents the primary data structures (types and interfaces often referred to as structs) used for configuration, data transfer, and results within the TAC SDK.

## Table of Contents

### Core Configuration
- [`SDKParams`](#sdkparams-type)
- [`TONParams`](#tonparams-type)
- [`TACParams`](#tacparams-type)

### Crosschain Transaction
- [`EvmProxyMsg`](#evmproxymsg-type)
- [`CrossChainTransactionOptions`](#crosschaintransactionoptions)
- [`AssetBridgingData`](#assetbridgingdata-type)
- [`CrosschainTx`](#crosschaintx)
### Transaction Tracking
- [`TransactionLinker`](#transactionlinker-type)

### Simulation Structures
- [`TACSimulationRequest`](#tacsimulationrequest)
- [`TACSimulationResult`](#tacsimulationresult)
- [`ExecutionFeeEstimationResult`](#executionfeeestimationresult)

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

# SDK Data Structures (Structs)

This file documents the primary data structures (types and interfaces often referred to as structs) used for configuration, data transfer, and results within the TAC SDK.

**Table of Contents**

- [Core Data Structures](#core-data-structures)
- [Simulation & Tracking Structures](#simulation--tracking-structures)
- [Execution & Status Structures](#execution--status-structures)
- [Metadata & Fee Structures](#metadata--fee-structures)
- [Jetton Structures](#jetton-structures)

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
    crossChainLayerNFTABI?: Interface | InterfaceAbi;
    crossChainLayerNFTBytecode?: string;
}
```

TAC Parameters for SDK:
- **`provider`** *(optional)*: Provider used for TAC smart contract interaction. Set for increasing rate limit or tests only
- **`settingsAddress`** *(optional)*: TAC settings contract address. Needed to retrieve protocol data. Set for tests only
- **`settingsABI`** *(optional)*: TAC settings contract ABI. Set for tests only 
- **`crossChainLayerABI`** *(optional)*: TAC CCL contract ABI. Set for tests only
- **`crossChainLayerTokenABI`** *(optional)*: TAC CCL Token contract ABI. Set for tests only
- **`crossChainLayerTokenBytecode`** *(optional)*: TAC CCL Token contract bytecode. Set for tests only
- **`crossChainLayerNFTABI`** *(optional)*: TAC CCL NFT contract ABI. Set for tests only
- **`crossChainLayerNFTBytecode`** *(optional)*: TAC CCL NFT contract bytecode. Set for tests only


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
- **`gasLimit`** *(optional)*: `gasLimit` is a parameter that will be passed on the TAC side. The executor must allocate at least gasLimit gas for executing the transaction on the TAC side. If this parameter is not specified, it will be calculated using the `simulateTACMessage` method(prefered).

This structure defines the logic you want to execute on the TAC side. This message is sent along with all the sharded messages related to the jetton bridging, enabling the TAC to process the intended logic on the TAC side during the crosschain transaction.

### `CrossChainTransactionOptions`
An optional configuration object for customizing advanced crosschain transaction behavior.

```ts
export type CrossChainTransactionOptions = {
    forceSend?: boolean;
    isRoundTrip?: boolean;
    protocolFee?: bigint;
    evmValidExecutors?: string[];
    evmExecutorFee?: bigint;
    tvmValidExecutors?: string[];
    tvmExecutorFee?: bigint;
};
```

- **forceSend** *(optional)*:  
  If true, the transaction will be sent even if the simulation phase detects potential issues or failures.  
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

### `AssetBridgingData (Type)`

This structure is used to specify the details of the Assets you want to bridge for your operation. This allows you to precisely control the tokens and amounts involved in your crosschain transaction.

```typescript
export type WithAddressFT = {
    type: AssetType.FT;
    /**
     * Address of TAC or TON token.
     * Empty if sending native TON coin.
     */
    address?: string;
};

export type WithAddressNFTItem = {
    type: AssetType.NFT;
    /**
     * Address NFT item token.
     */
    address: string;
};

export type WithAddressNFTCollectionItem = {
    type: AssetType.NFT;
    /**
     * Address NFT collection.
     */
    collectionAddress: string;
    /**
     * Index of NFT item in collection.
     */
    itemIndex: bigint;
};

export type WithAddressNFT = WithAddressNFTItem | WithAddressNFTCollectionItem;

export type WithAddress = WithAddressFT | WithAddressNFT;

export type RawAssetBridgingData<NFTFormatRequired extends WithAddressNFT = WithAddressNFTItem> = {
    /** Raw format, e.g. 12340000000 (=12.34 tokens if decimals is 9) */
    rawAmount: bigint;
} & & (WithAddressFT | NFTFormatRequired);

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

For fungible tokens:
- **`type`**: Type of the asset. Should be [`AssetType.FT`](./enums.md#assettype) for fungible tokens.
- **`rawAmount`** *(required if `amount` is not specified): Amount of Assets to be transferred taking into account the number of decimals.
- **`amount`** *(required if `rawAmount` is not specified): Amount of Assets to be transferred.
- **`decimals`** *(optional)*: Number of decimals for the asset. If not specified, the SDK will attempt to extract the decimals from the chain.
- **`address`** *(optional)*: TVM or EVM asset's address.

> **Note:** If you need to transfer a native TON coin, do not specify address.

For non-fungible tokens:
- **`type`**: Type of the asset. Should be [`AssetType.NFT`](./enums.md#assettype) for non-fungible tokens.
- **`rawAmount`** *(required if `amount` is not specified): Amount of Assets to be transfered. Should be 1 for NFTs.
- **`amount`** *(required if `rawAmount` is not specified): Amount of Assets to be transfered. Should be 1 for NFTs.
- **`address`** *(required if `collectionAddress` is not specified): TVM or EVM asset's address.
- **`collectionAddress`** *(required if `address` is not specified): TVM or EVM asset's collection address.
- **`itemIndex`** *(required if `address` is not specified): Index of the NFT item in the collection.


### `CrosschainTx`

```ts
export type CrosschainTx = {
    evmProxyMsg: EvmProxyMsg;
    assets?: AssetBridgingData[];
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

### `TACSimulationRequest`

```typescript
export type TACSimulationRequest = {
    tacCallParams: {
        arguments: string;
        methodName: string;
        target: string;
    };
    evmValidExecutors: string[];
    extraData: string;
    feeAssetAddress: string;
    shardsKey: number;
    tonAssets: {
        amount: string;
        tokenAddress: string;
        assetType: string;
    }[];
    tonCaller: string;
};
```

Represents a request to simulate an TAC message.

- **`tacCallParams`**: An object containing parameters for the TAC call.
  - **`arguments`**: Encoded arguments for the TAC method.
  - **`methodName`**: Name of the method to be called on the target TAC contract.
  - **`target`**: The target address on the TAC network.
- **`evmValidExecutors`**: valid executors.
- **`extraData`**: Additional non-root data to be included in TAC call.
- **`feeAssetAddress`**: Address of the asset used to cover fees; empty string if using native TON.
- **`shardsKey`**: Key identifying shards for the operation.
- **`tonAssets`**: An array of assets involved in the transaction.
  - **`amount`**: Amount of the asset to be transferred.
  - **`tokenAddress`**: Address of the token.
  - **`assetType`**: Type of the asset. Either fungible or non-fungible.
- **`tonCaller`**: Address of the caller in the TON.

### `ExecutionFeeEstimationResult`

```ts
export type ExecutionFeeEstimationResult = {
  feeParams: FeeParams;
  simulation: TACSimulationResult;
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
};
```

Holds metadata associated with a crosschain transaction, including the initiating party, allowed executors, and detailed fee information.

- **`initialCaller`**:  
  Information about the original sender of the transaction, including address and source blockchain.

- **`validExecutors`**:  
  Specifies the list of executor addresses authorized to handle execution on TAC and TON.

- **`feeInfo`**:  
  Object containing detailed information about fees required for the transaction execution.


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
{
    init: boolean;
    index: number;
    collectionAddress: Address;
    ownerAddress: Address | null;
    content: Cell | null;
}
```

- **`init`**: Indicates whether item is active, i.e initialized by NFT collection and has not been burnt
- **`index`**: Index of the item in collection
- **`collectionAddress`**: Address of collection
- **`ownerAddress`**: Address of the item owner
- **`content`**: Content(metadata) of the item

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


### `FeeInfo`

```ts
export type FeeInfo = {
    tac: GeneralFeeInfo;
    ton: GeneralFeeInfo;
};
```
Contains fee information for both TAC and TON blockchain networks.

- **`tac`**: Complete fee structure for transactions on the TAC blockchain.
- **`ton`**: Complete fee structure for transactions on the TON blockchain.
