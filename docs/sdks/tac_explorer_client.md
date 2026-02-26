# TacExplorerClient Class

## Table of Contents

- [TacExplorerClient Class](#tacexplorerclient-class)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Getting Started](#getting-started)
    - [Constructor](#constructor)
    - [Example Usage](#example-usage)
  - [Using with TacSdk](#using-with-tacsdk)
  - [Methods](#methods)
    - [`getTACGasPrice`](#gettacgasprice)
  - [Network Endpoints](#network-endpoints)

---

## Overview

`TacExplorerClient` is a client for interacting with the TAC blockchain explorer API. It provides methods to retrieve blockchain-related data such as gas prices, block information, and other explorer-specific metrics.

The `TacExplorerClient` is designed to fetch data from the TAC blockchain explorer. It automatically uses the correct explorer endpoint based on the network (mainnet or testnet).

---

## Getting Started

### Constructor

```ts
new TacExplorerClient(
  explorerApiEndpoint: string,
  httpClient?: IHttpClient
)
```

Creates a new TacExplorerClient instance.

**Parameters:**
- `explorerApiEndpoint`: The base URL of the TAC explorer API
- `httpClient` *(optional)*: Custom HTTP client implementation (defaults to `AxiosHttpClient`)

### Example Usage

```ts
import { TacExplorerClient } from "@tonappchain/sdk";

// For mainnet
const explorerClient = new TacExplorerClient('https://explorer.tac.build/api/v2/');

// For testnet
const explorerClient = new TacExplorerClient('https://spb.explorer.tac.build/api/v2/');

// Get current gas prices
const gasPrice = await explorerClient.getTACGasPrice();
console.log('Average gas price:', gasPrice.gasPrices.average);
console.log('Fast gas price:', gasPrice.gasPrices.fast);
console.log('Slow gas price:', gasPrice.gasPrices.slow);
```

---

## Using with TacSdk

The `TacSdk` automatically creates and manages a `TacExplorerClient` instance internally based on the network configuration. You can access explorer functionality through the SDK without manually creating a client:

```ts
import { TacSdk, Network } from "@tonappchain/sdk";

const sdk = await TacSdk.create({
    network: Network.TESTNET,
});

// Get current gas prices through the SDK
const gasPrice = await sdk.getTACGasPrice();
console.log('Average gas price:', gasPrice.average);
console.log('Fast gas price:', gasPrice.fast);
console.log('Slow gas price:', gasPrice.slow);
```

> **Recommended**: Use `TacSdk.getTACGasPrice()` for most use cases, as it automatically manages the explorer client for you.

---

## Methods

### `getTACGasPrice`

```ts
getTACGasPrice(): Promise<TacGasPriceResponse>
```

Retrieves the current TAC gas prices from the blockchain explorer.

**Returns:** 

The response contains:
- `gasPrices.average` - Average gas price for normal transactions
- `gasPrices.fast` - Gas price for faster transaction confirmation
- `gasPrices.slow` - Gas price for slower, cheaper transactions

**Example:**

```ts
const explorerClient = new TacExplorerClient('https://explorer.tac.build/api/v2/');

const response = await explorerClient.getTACGasPrice();
console.log('Gas prices:', response.gasPrices);
// Output: { average: 1000000000, fast: 1500000000, slow: 500000000 }
```

**Throws:**
- `GasPriceFetchError` - If the explorer endpoint fails to respond or returns invalid data

---

## Network Endpoints

The explorer API endpoints vary by network. These endpoints are automatically configured when using `TacSdk`:

| Network | Endpoint |
|---------|----------|
| **Mainnet** | `https://explorer.tac.build/api/v2/` |
| **Testnet** | `https://spb.explorer.tac.build/api/v2/` |

**Accessing Network-Specific Endpoints:**

```ts
import { mainnet, testnet } from "@tonappchain/sdk";

// Mainnet endpoint
console.log(mainnet.TAC_EXPLORER_API_ENDPOINT);
// Output: https://explorer.tac.build/api/v2/

// Testnet endpoint
console.log(testnet.TAC_EXPLORER_API_ENDPOINT);
// Output: https://spb.explorer.tac.build/api/v2/
```

---
