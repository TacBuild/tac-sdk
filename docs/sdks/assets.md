# Assets Module

## Table of Contents

- [Assets Module](#assets-module)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Asset Interface](#asset-interface)
  - [AssetFactory Class](#assetfactory-class)
    - [Static Methods](#static-methods)
      - [`from`](#from)
  - [FT Class](#ft-class)
    - [Creating Instances](#creating-instances)
    - [Core Methods](#core-methods)
      - [`getJettonData`](#getjettondata)
      - [`getOrigin`](#getorigin)
      - [`getTVMAddress`](#gettvmaddress)
      - [`getUserWalletAddress`](#getuserwalletaddress)
      - [`getUserBalance`](#getuserbalance)
      - [`getUserBalanceExtended`](#getuserbalanceextended)
      - [`getDecimals`](#getdecimals)
      - [`checkBalance`](#checkbalance)
      - [`checkCanBeTransferredBy`](#checkcanbetransferredby)
      - [`getBalanceOf`](#getbalanceof)
      - [`generatePayload`](#generatepayload)
  - [NFT Class](#nft-class)
    - [Creating Instances](#creating-instances)
    - [Static Methods](#static-methods)
      - [`getItemData`](#getitemdata)
      - [`getCollectionData`](#getcollectiondata)
      - [`getOrigin`](#getorigin)
      - [`getTVMAddress`](#gettvmaddress)
      - [`getItemAddress`](#getitemaddress)
    - [Instance Methods](#instance-methods)
      - [`getItemData`](#getitemdata)
      - [`getCollectionData`](#getcollectiondata)
      - [`getUserBalance`](#getuserbalance)
      - [`isOwnedBy`](#isownedby)
      - [`checkCanBeTransferredBy`](#checkcanbetransferredby)
      - [`getBalanceOf`](#getbalanceof)
      - [`generatePayload`](#generatepayload)
  - [TON Class](#ton-class)
    - [Creating Instances](#creating-instances)
    - [Core Methods](#core-methods)
      - [`generatePayload`](#generatepayload)
      - [`getUserBalance`](#getuserbalance)
      - [`checkCanBeTransferredBy`](#checkcanbetransferredby)
      - [`getBalanceOf`](#getbalanceof)
      - [`checkBalance`](#checkbalance)
  - [Example Usage](#example-usage)

---

## Overview

The assets module provides implementations for different types of assets in the TAC–TON cross-chain ecosystem. It includes classes for native TON coins, Jettons (fungible tokens), NFTs (non-fungible tokens), and utility functions for asset management.

All asset classes implement the `Asset` interface, providing a consistent API across different types.

---

## Asset Interface

```ts
interface Asset {
  address: string;
  type: AssetType;
  rawAmount: bigint;
  clone: Asset;
  withAmount(amount: number): Asset;
  withRawAmount(rawAmount: bigint): Asset;
  addAmount(amount: number): Asset;
  addRawAmount(rawAmount: bigint): Asset;
  getEVMAddress(): Promise<string>;
  getTVMAddress(): Promise<string>;
  generatePayload(params: {
    excessReceiver: string;
    evmData: Cell;
    crossChainTonAmount?: bigint;
    forwardFeeTonAmount?: bigint;
    feeParams?: FeeParams;
  }): Promise<Cell>;
  checkCanBeTransferredBy(userAddress: string): Promise<void>;
  getBalanceOf(userAddress: string): Promise<bigint>;
}
```

The `Asset` interface defines the contract for all token implementations in the SDK.

**Properties:**
- `address`: Token address on the respective blockchain
- `type`: Asset type (FT for fungible, NFT for non-fungible)
- `rawAmount`: Raw amount of the token (considering decimals)

**Methods:**
- `clone`: Creates a copy of the token
- `withAmount`: Sets the token amount in human-readable units (replaces existing amount)
- `withRawAmount`: Sets the token amount in raw base units (replaces existing amount)
- `addAmount`: Adds to the existing token amount in human-readable units
- `addRawAmount`: Adds to the existing token amount in raw base units
- `getEVMAddress`: Gets the EVM address for the token
- `getTVMAddress`: Gets the TVM address for the token
- `generatePayload`: Generates cross-chain operation payload with unified object parameters
- `checkCanBeTransferredBy`: Checks if the token can be transferred by the user (requires userAddress parameter)
- `getBalanceOf`: Gets the balance of the token for the given user address

---

## AssetFactory Class

`AssetFactory` is a utility class that provides factory methods for creating token instances based on address and type detection.

### Static Methods

#### `from`

```ts
static from(
  configuration: IConfiguration,
  token: AssetFromFTArg | AssetFromNFTItemArg | AssetFromNFTCollectionArg
): Promise<Asset>
```

Creates an asset instance from the given parameters. This method handles address conversion between EVM and TVM addresses and creates the appropriate asset type.

**Parameters:**
- `configuration`: SDK configuration
- `token`: Asset configuration object. For NFTs, specify `addressType` (ITEM or COLLECTION). When using `COLLECTION`, `index` is required. For native TON, use `TON.create(config)` or pass `address: configuration.nativeTONAddress` with `tokenType: AssetType.FT`.

**Returns:** Promise resolving to an `Asset` instance

---

## FT Class

`FT` represents fungible tokens (Jettons) on the TON network. It implements the `Asset` interface and provides methods for fungible token-specific operations.

### Creating Instances

```ts
static fromAddress(configuration: IConfiguration, address: TVMAddress | EVMAddress): Promise<FT>
```

Creates a new FT instance by TVM or EVM address. Origin is detected automatically and decimals are retrieved based on token type:
- **TON origin tokens**: Decimals retrieved from jetton metadata
- **TAC origin tokens**: 
  - Native tokens: Uses 18 decimals
  - ERC20 contracts: Decimals retrieved from ERC20 contract, with fallback to jetton metadata if unavailable

**Properties:**
- `addresses`: Object containing token and optional EVM addresses
- `address`: Main token address (TVM)
- `origin`: Asset origin (TON or TAC)
- `type`: Always `AssetType.FT` for fungible tokens
- `rawAmount`: Current token amount in raw format
- `clone`: Creates a copy of the token instance

### Core Methods

#### `getJettonData`

```ts
static getJettonData(contractOpener: IContractOpener, address: string)
```

Retrieves fungible token data from the contract at the given address.

**Parameters:**
- `contractOpener`: Contract opener for reading contract state
- `address`: Fungible token master contract address

**Returns:** Fungible token data including metadata, total supply, and mintable status

#### `getOrigin`

```ts
static getOrigin(configuration: IConfiguration, address: TVMAddress): Promise<Origin>
```

Determines the origin of a fungible token (whether it's native to TON or wrapped from TAC) by comparing contract code and constructor data.

**Returns:** `Origin.TON` or `Origin.TAC`

#### `getOriginAndData`

```ts
static getOriginAndData(configuration: IConfiguration, address: TVMAddress): Promise<FTOriginAndData>
```

Determines the origin of a fungible token and returns comprehensive data about the token, including origin information, jetton minter contract, and additional metadata based on the token type.

**Parameters:**
- `configuration`: SDK configuration
- `address`: TVM address of the fungible token

**Returns:** [`FTOriginAndData`](./../models/structs.md#ftoriginanddata) object containing:
- `origin`: Token origin (TON or TAC)
- `jettonMinter`: Opened jetton minter contract instance
- `evmAddress` *(optional)*: EVM address for TAC-origin tokens
- `jettonData` *(optional)*: Jetton metadata for TON-origin tokens

#### `getTVMAddress`

```ts
static getTVMAddress(configuration: IConfiguration, evmAddress: string): Promise<string>
```

Computes the TVM address for a fungible token given its EVM address.

**Parameters:**
- `configuration`: SDK configuration
- `evmAddress`: EVM address of the token

**Returns:** TVM address of the fungible token

#### `getEVMAddress`

```ts
static getEVMAddress(configuration: IConfiguration, address: TVMAddress): Promise<string>
```

Computes the EVM address for a fungible token given its TVM address. If Jetton is TON-native, computes paired EVM address; if TAC-native, reads original EVM address from Jetton master.

**Parameters:**
- `configuration`: SDK configuration
- `address`: TVM address of the Jetton master

**Returns:** EVM address of the fungible token

#### `getUserWalletAddress`

```ts
getUserWalletAddress(userAddress: string): Promise<string>
```

Gets the user's Jetton wallet address for this specific Jetton.

**Parameters:**
- `userAddress`: User's wallet address

**Returns:** Jetton wallet address

#### `getUserBalance`

```ts
getUserBalance(userAddress: string): Promise<bigint>
```

Gets the user's balance of this Jetton.

**Parameters:**
- `userAddress`: User's wallet address

**Returns:** Raw balance amount

#### `getUserBalanceExtended`

```ts
getUserBalanceExtended(userAddress: string): Promise<UserWalletBalanceExtended>
```

Gets detailed balance information for the user's Jetton wallet.

**Parameters:**
- `userAddress`: User's wallet address

**Returns:** Promise resolving to extended balance information including:
- `rawAmount`: Raw balance amount
- `decimals`: Asset decimals
- `amount`: Human-readable amount
- `exists`: Whether the wallet exists

#### `getDecimals`

```ts
getDecimals(): Promise<number>
```

Gets the number of decimal places for this Jetton. The retrieval method depends on the token's origin:

- **TON-origin tokens**: Reads decimals from Jetton metadata (defaults to 9 if not specified)
- **TAC-origin tokens**: 
  - Native TAC tokens: Returns 18 (standard for native blockchain tokens)
  - ERC20 tokens: Fetches decimals from the ERC20 contract's `decimals()` method

**Returns:** Number of decimal places based on token origin and type

#### `checkBalance`

```ts
checkBalance(userAddress: string): Promise<void>
```

Checks if the user has sufficient balance for the specified amount.

**Parameters:**
- `userAddress`: User's wallet address

**Throws:** `InsufficientBalanceError` if balance is insufficient

#### `checkCanBeTransferredBy`

```ts
checkCanBeTransferredBy(userAddress: string): Promise<void>
```

Checks if the token can be transferred by the user.

**Parameters:**
- `userAddress`: User's wallet address

**Throws:** `InsufficientBalanceError` if the token cannot be transferred

#### `getBalanceOf`

```ts
getBalanceOf(userAddress: string): Promise<bigint>
```

Gets the balance of the token for the given user address.

**Parameters:**
- `userAddress`: User's wallet address

**Returns:** Raw balance amount

#### `generatePayload`

```ts
generatePayload(params: {
  excessReceiver: string;
  evmData: Cell;
  crossChainTonAmount?: bigint;
  forwardFeeTonAmount?: bigint;
  feeParams?: FeeParams;
}): Promise<Cell>
```

Generates the payload for cross-chain operations involving this Jetton using the unified token interface.

**Parameters:**
- `params.excessReceiver`: Address to receive excess funds
- `params.evmData`: EVM data cell containing operation details
- `params.crossChainTonAmount` *(optional)*: Amount of TON to transfer (defaults to 0)
- `params.forwardFeeTonAmount` *(optional)*: Forward fee amount (defaults to 0)
- `params.feeParams` *(optional)*: Fee parameters for the operation

**Returns:** Promise resolving to Cell containing the operation payload

**Operation Logic:**
- For TAC-origin Jettons: Creates burn payload
- For TON-origin Jettons: Creates transfer payload to cross-chain layer

---

## NFT Class

`NFT` represents non-fungible tokens on the TON network. It implements the `Asset` interface and provides methods for NFT-specific operations.

### Creating Instances

```ts
// From item address (TVM)
NFT.fromItem(configuration: IConfiguration, itemAddress: TVMAddress): Promise<NFT>

// From collection (TVM or EVM) address and index
NFT.fromCollection(
  configuration: IConfiguration,
  item: { collection: TVMAddress | EVMAddress; index: bigint }
): Promise<NFT>
```

**Properties:**
- `addresses`: Object containing item, collection, index, and optional EVM addresses
- `address`: NFT item address (TVM)
- `origin`: Asset origin (TON or TAC)
- `type`: Always `AssetType.NFT` for NFTs
- `rawAmount`: Always `1n` for NFTs
- `clone`: Creates a copy of the token instance

### Static Methods

#### `getItemData`

```ts
static getItemData(contractOpener: ContractOpener, address: string)
```

Retrieves NFT item data from the contract at the given address.

**Returns:** NFT item data including index, collection address, and owner

#### `getCollectionData`

```ts
static getCollectionData(contractOpener: ContractOpener, address: string)
```

Retrieves NFT collection data from the contract at the given address.

**Returns:** NFT collection data including metadata and owner

#### `getOrigin`

```ts
static getOrigin(configuration: IConfiguration, itemOrCollection: TVMAddress): Promise<Origin>
```

Determines the origin of an NFT (whether it's native to TON or wrapped from TAC) by inspecting code on-chain.

**Returns:** `Origin.TON` or `Origin.TAC`

#### `getTVMAddress`

```ts
static getTVMAddress(
  configuration: IConfiguration,
  evmAddress: string,
  tokenId?: bigint
): Promise<string>
```

Computes the TVM address for an NFT given its EVM address and optional token ID.

**Parameters:**
- `configuration`: SDK configuration
- `evmAddress`: EVM address of the NFT collection
- `tokenId` *(optional)*: NFT item index/ID. If not provided, returns collection address

**Returns:** TVM address of the NFT item (if tokenId provided) or collection address

#### `getItemAddress`

```ts
static getItemAddress(
  contractOpener: ContractOpener,
  collectionAddress: string,
  index: bigint
): Promise<string>
```

Gets the item address for an NFT in a collection.

**Parameters:**
- `contractOpener`: Contract opener for reading contract state
- `collectionAddress`: Collection contract address
- `index`: NFT item index

**Returns:** NFT item address

### Instance Methods

#### `getItemData`

```ts
getItemData(): Promise<NFTItemData>
```

Gets data for this specific NFT item.

**Returns:** Promise resolving to NFT item data including index, collection address, and owner

#### `getCollectionData`

```ts
getCollectionData(): Promise<CollectionData>
```

Gets data for the NFT collection this item belongs to.

**Returns:** Promise resolving to NFT collection data including metadata and owner

#### `getUserBalance`

```ts
getUserBalance(userAddress: string): Promise<bigint>
```

Gets the user's balance of this NFT (typically 0 or 1).

**Parameters:**
- `userAddress`: User's wallet address

**Returns:** Balance amount (0 or 1 for NFTs)

#### `isOwnedBy`

```ts
isOwnedBy(userAddress: string): Promise<boolean>
```

Checks if the user is the owner of this NFT.

**Parameters:**
- `userAddress`: User's wallet address

**Returns:** `true` if the user owns the NFT, `false` otherwise

#### `checkCanBeTransferredBy`

```ts
checkCanBeTransferredBy(userAddress: string): Promise<void>
```

Checks if the token can be transferred by the user.

**Parameters:**
- `userAddress`: User's wallet address

**Throws:** `InsufficientBalanceError` if the token cannot be transferred

#### `getBalanceOf`

```ts
getBalanceOf(userAddress: string): Promise<bigint>
```

Gets the balance of the token for the given user address.

**Parameters:**
- `userAddress`: User's wallet address

**Returns:** Raw balance amount (0 or 1 for NFTs)

#### `generatePayload`

```ts
generatePayload(params: {
  excessReceiver: string;
  evmData: Cell;
  crossChainTonAmount?: bigint;
  forwardFeeTonAmount?: bigint;
  feeParams?: FeeParams;
}): Promise<Cell>
```

Generates the payload for cross-chain operations involving this NFT using the unified token interface.

**Parameters:**
- `params.excessReceiver`: Address to receive excess funds
- `params.evmData`: EVM data cell containing operation details
- `params.crossChainTonAmount` *(optional)*: Amount of TON to transfer (defaults to 0)
- `params.forwardFeeTonAmount` *(optional)*: Forward fee amount (defaults to 0)
- `params.feeParams` *(optional)*: Fee parameters for the operation

**Returns:** Promise resolving to Cell containing the operation payload

**Operation Logic:**
- For TAC-origin NFTs: Creates burn payload
- For TON-origin NFTs: Creates transfer payload to cross-chain layer

---

## TON Class

`TON` represents the native TON coin. It implements the `Asset` interface and provides methods for native TON operations.

### Creating Instances

```ts
TON.create(config: IConfiguration): TON
```

Creates a new TON token instance with zero amount.

**Parameters:**
- `config`: SDK configuration

**Note:** Use `withAmount()` or `addAmount()` to set the token amount after creation.

**Properties:**
- `address`: Always empty string for native TON
- `type`: Always `AssetType.FT` for TON
- `rawAmount`: Current TON amount in nano format
- `clone`: Creates a copy of the token instance

### Core Methods

#### `generatePayload`

```ts
generatePayload(params: {
  excessReceiver: string;
  evmData: Cell;
  crossChainTonAmount?: bigint;
  forwardFeeTonAmount?: bigint;
  feeParams?: FeeParams;
}): Promise<Cell>
```

Generates the transfer payload for native TON cross-chain operations using the unified token interface.

**Parameters:**
- `params.excessReceiver`: Address to receive excess funds
- `params.evmData`: EVM data cell
- `params.feeParams`: Fee parameters
- `params.crossChainTonAmount` *(optional)*: Not used for TON transfers
- `params.forwardFeeTonAmount` *(optional)*: Not used for TON transfers

**Returns:** Promise resolving to Cell containing the TON transfer payload

#### `getUserBalance`

```ts
getUserBalance(userAddress: string): Promise<bigint>
```

Gets the user's TON balance.

**Parameters:**
- `userAddress`: User's wallet address

**Returns:** TON balance in raw format (nano)

#### `checkCanBeTransferredBy`

```ts
checkCanBeTransferredBy(userAddress: string): Promise<void>
```

Checks if the token can be transferred by the user.

**Parameters:**
- `userAddress`: User's wallet address

**Throws:** `InsufficientBalanceError` if the token cannot be transferred

#### `getBalanceOf`

```ts
getBalanceOf(userAddress: string): Promise<bigint>
```

Gets the balance of the token for the given user address.

**Parameters:**
- `userAddress`: User's wallet address

**Returns:** Raw balance amount

#### `checkBalance`

```ts
static checkBalance(
  sender: SenderAbstraction,
  config: IConfiguration,
  transactions: ShardTransaction[]
): Promise<void>
```

Checks if the sender has sufficient TON balance for the given transactions.

**Parameters:**
- `sender`: Sender abstraction
- `config`: SDK configuration
- `transactions`: Array of transactions to check

**Possible exceptions:**
- `InsufficientBalanceError`: Thrown when balance is insufficient

---

## Example Usage

```ts
import { AssetFactory, FT, NFT, TON, Configuration, Network } from "@tonappchain/sdk";
import { testnet } from "@tonappchain/artifacts";

// Create configuration
const config = await Configuration.create(Network.TESTNET, testnet);

// Create tokens using AssetFactory
const jetton = await AssetFactory.from(
  config,
  { address: "EQ..." }
);

const nft = await AssetFactory.from(
  config,
  { address: "EQ...", index: 1n }
);

// Create native TON token
const tonToken = TON.create(config);
await tonToken.withAmount({ amount: 1.5 }); // Set amount to 1.5 TON

// Work with fungible tokens
const jettonData = await FT.getJettonData(contractOpener, "EQ...");
const userWallet = await jetton.getUserWalletAddress("EQ...");
const balance = await jetton.getUserBalance("EQ...");
const canTransfer = await jetton.checkCanBeTransferredBy("EQ...");
const balanceOf = await jetton.getBalanceOf("EQ...");

// Work with NFTs
const nftData = await NFT.getItemData(contractOpener, "EQ...");
const collectionData = await NFT.getCollectionData(contractOpener, "EQ...");
const itemAddress = await NFT.getItemAddress(contractOpener, "EQ...", 1n);
const isOwner = await nft.isOwnedBy("EQ...");
const nftBalanceOf = await nft.getBalanceOf("EQ...");

// Work with native TON
const tonBalance = await tonToken.getUserBalance("EQ...");
const tonCanTransfer = await tonToken.checkCanBeTransferredBy("EQ...");
const tonBalanceOf = await tonToken.getBalanceOf("EQ...");
const payload = await tonToken.generatePayload({
    excessReceiver: "EQ...",
    evmData,
    feeParams
});

// Check TON balance for transactions
await TON.checkBalance(sender, config, transactions);

// Token operations
const clonedToken = jetton.clone;
const tokenWithAmount = await jetton.withAmount({ amount: 10.5 });
const evmAddress = await jetton.getEVMAddress();
const tvmAddress = await jetton.getTVMAddress();

// Generate payloads for cross-chain operations
const jettonPayload = await jetton.generatePayload({
  excessReceiver: "EQ...",
  evmData,
  crossChainTonAmount: toNano(0.1),
  forwardFeeTonAmount: toNano(0.05),
  feeParams
});

const nftPayload = await nft.generatePayload({
  excessReceiver: "EQ...",
  evmData,
  crossChainTonAmount: toNano(0.1),
  forwardFeeTonAmount: toNano(0.05),
  feeParams
});
```

### Integration with Transaction Managers

Assets are designed to work seamlessly with the TAC SDK's transaction management system:

```ts
// Using assets with TacSdk (recommended)
import { TacSdk } from "@tonappchain/sdk";

const sdk = await TacSdk.create({ network: Network.TESTNET });

// Use assets in TON -> TAC cross-chain transactions
const result = await sdk.sendCrossChainTransaction(
  evmProxyMsg,
  sender,
  [jetton, nft, tonToken],
  options
);

// For advanced usage with TONTransactionManager directly
import { TONTransactionManager } from "@tonappchain/sdk";

const tonManager = new TONTransactionManager(config, simulator, operationTracker);
const tx: CrosschainTx = {
  assets: [jetton, nft, tonToken],
  evmProxyMsg,
  feeParams: {
    tonExecutorFee: BigInt("50000000"),
    evmExecutorFee: BigInt("1000000000000000")
  }
};

const result = await tonManager.sendCrossChainTransaction(
  evmProxyMsg,
  sender,
  tx,
  waitOptions
);
```