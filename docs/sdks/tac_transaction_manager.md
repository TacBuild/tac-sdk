# TACTransactionManager

> **⚠️ EXPERIMENTAL FEATURE**: This TAC functionality is not a release version and will change in future versions. It is recommended to use this only for testing purposes and not in production environments.

## Table of Contents

- [TACTransactionManager](#tactransactionmanager)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Constructor](#constructor)
  - [`bridgeTokensToTON`](#bridgetokenstoton)
  - [Integration with TacSdk](#integration-with-tacsdk)
  - [Example Usage](#example-usage)
    - [Using via TacSdk (Recommended)](#using-via-tacsdk-recommended)
    - [Direct Usage (Advanced)](#direct-usage-advanced)
    - [Error Handling](#error-handling)

---

## Overview

`TACTransactionManager` implements the `ITACTransactionManager` interface and is responsible for bridging tokens from the TAC (EVM) side to the TON blockchain.

**Key Features:**
- **Asset Approval**: Automatically approves ERC20/ERC721 tokens for the cross-chain layer
- **Fee Calculation**: Calculates optimal executor fees if not provided
- **Native Asset Handling**: Seamlessly includes native TAC tokens in bridge operations
- **Multi-Asset Support**: Handles both fungible tokens (FT) and non-fungible tokens (NFT)
- **Comprehensive Logging**: Detailed logging for debugging and monitoring

---

## Constructor

```typescript
new TACTransactionManager(
  config: IConfiguration,
  operationTracker: IOperationTracker,
  logger?: ILogger
)
```

Creates a TACTransactionManager instance with the required dependencies.

**Parameters:**
- **`config`**: Configuration object implementing `IConfiguration`
- **`operationTracker`**: OperationTracker instance for monitoring transactions
- **`logger`** *(optional)*: Logger implementing `ILogger` (defaults to `NoopLogger`)

---

## `bridgeTokensToTON`

```typescript
async bridgeTokensToTON(
  signer: Wallet,
  value: bigint,
  tonTarget: string,
  assets?: Asset[],
  tvmExecutorFee?: bigint,
  tvmValidExecutors?: string[]
): Promise<string>
```

### **Purpose**

Bridges native EVM value and optional assets to TON chain via executor. This method handles token approvals, fee calculations, and the complete bridge transaction process.

### **Parameters**

- **`signer`**: Ethers Wallet used to sign the EVM transaction
- **`value`**: Amount of native EVM currency (wei as bigint)
- **`tonTarget`**: Recipient TVM address on TON blockchain
- **`assets`** *(optional)*: List of TAC assets to include in the bridge
- **`tvmExecutorFee`** *(optional)*: Explicit TON-side executor fee (calculated automatically if not provided)
- **`tvmValidExecutors`** *(optional)*: Whitelist of allowed TVM executors

### **Returns** `Promise<string>`

Returns the EVM transaction hash for tracking the bridge operation.

### **Example**

```typescript
import { TACTransactionManager } from '@tonappchain/sdk';

const tacManager = new TACTransactionManager(config, tracker, logger);

const assets = [
    await AssetFactory.from(config, {
        address: "0x...", // TAC token address
        tokenType: AssetType.FT,
    }).withAmount(100)
];

const txHash = await tacManager.bridgeTokensToTON(
    wallet,
    ethers.parseEther("1.0"), // 1 TAC
    "EQBx...", // TON recipient address
    assets
);
```

### **Process Overview**

1. Validates the TON target address
2. Adds native TAC asset if value > 0
3. Calculates executor fee if not provided
4. Approves all assets for the cross-chain layer contract
5. Constructs and sends the bridge message
6. Returns transaction hash for tracking

---

## Integration with TacSdk

`TACTransactionManager` is used internally by the main `TacSdk` class to power TAC->TON bridging functionality. The SDK automatically instantiates and manages this component, providing a unified interface while maintaining the architectural separation underneath.

---

## Example Usage

### Using via TacSdk (Recommended)

The recommended way to use the TAC transaction manager is through the main `TacSdk` class, which handles the instantiation and coordination:

```typescript
import { TacSdk, Network, ConsoleLogger } from "@tonappchain/sdk";

// Create SDK instance
const sdk = await TacSdk.create({ 
  network: Network.TESTNET 
}, new ConsoleLogger());

// TAC -> TON bridging (uses TACTransactionManager internally)
const txHash = await sdk.bridgeTokensToTON(
  ethersWallet,
  ethers.parseEther("0.1"), // 0.1 TAC
  "EQBx...", // TON recipient
  [tacAsset1, tacAsset2],
  BigInt("50000000") // executor fee
);
```

### Direct Usage (Advanced)

For advanced use cases, you can instantiate the TAC transaction manager directly:

```typescript
import { 
  TACTransactionManager, 
  Configuration, 
  OperationTracker, 
  ConsoleLogger, 
  Network 
} from "@tonappchain/sdk";

// Create dependencies
const config = await Configuration.create(Network.TESTNET);
const operationTracker = new OperationTracker(Network.TESTNET);
const logger = new ConsoleLogger();

// Create TAC Transaction Manager for TAC -> TON operations
const tacManager = new TACTransactionManager(
  config,
  operationTracker,
  logger
);

// Bridge TAC -> TON
const txHash = await tacManager.bridgeTokensToTON(
  ethersWallet,
  ethers.parseEther("0.1"), // 0.1 TAC
  "EQBx...", // TON recipient
  [tacAsset1, tacAsset2],
  BigInt("50000000") // executor fee
);
```

### Error Handling

The TAC transaction manager includes comprehensive error handling:

```typescript
try {
  const txHash = await tacManager.bridgeTokensToTON(
    ethersWallet,
    value,
    tonTarget,
    assets
  );
  console.log('Bridge transaction successful:', txHash);
} catch (error) {
  if (error instanceof AddressError) {
    console.error('Invalid TON address:', error.message);
  } else if (error instanceof InsufficientBalanceError) {
    console.error('Insufficient balance for bridging:', error.message);
  } else {
    console.error('Bridge transaction failed:', error.message);
  }
}
```