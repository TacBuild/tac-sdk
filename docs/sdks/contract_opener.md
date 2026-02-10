# ContractOpener

## Table of Contents

- [ContractOpener](#contractopener)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Architecture Benefits](#architecture-benefits)
  - [BaseContractOpener](#basecontractopener)
    - [Methods Implemented in Base Class](#methods-implemented-in-base-class)
      - [`getTransactionByHash`](#gettransactionbyhash)
      - [`getAdjacentTransactions`](#getadjacenttransactions)
      - [`trackTransactionTree`](#tracktransactiontree)
    - [Abstract Methods (Must be Implemented)](#abstract-methods-must-be-implemented)
  - [Opener Implementations](#opener-implementations)
    - [TonClientOpener](#tonclientopener)
    - [OrbsOpener](#orbsopener)
    - [OrbsOpener4](#orbsopener4)
    - [LiteClientOpener](#liteclientopener)
    - [SandboxOpener](#sandboxopener)
  - [RetryableContractOpener](#retryablecontractopener)
  - [Utility Functions](#utility-functions)
    - [`getHttpEndpointWithRetry`](#gethttpendpointwithretry)
    - [`getHttpV4EndpointWithRetry`](#gethttpv4endpointwithretry)
  - [Constants](#constants)
  - [Error Handling](#error-handling)
  - [Example: Creating Custom Opener](#example-creating-custom-opener)
  - [Best Practices](#best-practices)
  - [Migration from Old Architecture](#migration-from-old-architecture)

---

## Overview

The `ContractOpener` interface provides a unified way to interact with TON blockchain through different clients and protocols. All implementations extend the `BaseContractOpener` abstract class which provides common functionality.

The ContractOpener architecture consists of:
- **ContractOpener Interface**: Defines the contract for all opener implementations
- **BaseContractOpener**: Abstract base class with common implementation
- **Concrete Implementations**: Protocol-specific openers (TonClient, Orbs, LiteClient, etc.)
- **RetryableContractOpener**: Wrapper providing automatic retry and fallback logic

## Architecture Benefits

- **Code Reuse**: Common logic implemented once in `BaseContractOpener`
- **Type Safety**: Strongly typed with proper TypeScript interfaces
- **Easy Extension**: New openers only need to implement 5 protocol-specific methods
- **No Duplication**: Complex methods like `trackTransactionTree` work automatically for all openers

---

## BaseContractOpener

The `BaseContractOpener` abstract class provides common functionality for all opener implementations. Subclasses only need to implement protocol-specific methods while inheriting complex transaction tracking logic.

### Methods Implemented in Base Class

#### `getTransactionByHash`

```ts
getTransactionByHash(
  address: Address,
  hash: string,
  opts?: GetTransactionsOptions
): Promise<Transaction | null>
```

Finds a transaction by its hash with automatic retry logic. The method polls for the transaction until found or timeout is reached, checking three possible match types: transaction hash itself, external incoming message hash, or internal message hash.

**Parameters:**
- `address: Address` - The contract address to search transactions for
- `hash: string` - Transaction hash in base64 format
- `opts?: GetTransactionsOptions` - Optional fetch options:
  - `limit?: number` - Maximum number of transactions to fetch
  - `lt?: string` - Logical time to start from (fetches transactions before this lt)
  - `hash?: string` - Transaction hash in base64 format to start from
  - `to_lt?: string` - Logical time to fetch up to (stop condition)
  - `inclusive?: boolean` - Include transaction with exact `to_lt` (default: false)
  - `archival?: boolean` - Include archival transactions (default: true)
  - `timeoutMs?: number` - Maximum time to wait for transaction search (default: 180000ms)
  - `retryDelayMs?: number` - Delay between retries (default: 2000ms)

**Returns:** `Promise<Transaction | null>` - The found transaction or null if not found within timeout

---

#### `getAdjacentTransactions`

```ts
getAdjacentTransactions(
  address: Address,
  hash: string,
  opts?: GetTransactionsOptions
): Promise<Transaction[]>
```

Gets child transactions (from outgoing messages) and optionally parent transaction (from incoming message) for a given root transaction. This is useful for analyzing transaction chains and dependencies.

**Parameters:**
- `address: Address` - The contract address of the root transaction
- `hash: string` - Root transaction hash in base64 format
- `opts?: GetTransactionsOptions` - Optional fetch options:
  - `limit?: number` - Maximum number of transactions to fetch
  - `lt?: string` - Logical time to start from (fetches transactions before this lt)
  - `hash?: string` - Transaction hash in base64 format to start from
  - `to_lt?: string` - Logical time to fetch up to (stop condition)
  - `inclusive?: boolean` - Include transaction with exact `to_lt` (default: false)
  - `archival?: boolean` - Include archival transactions (default: true)
  - `timeoutMs?: number` - Maximum time to wait for transaction search (default: 180000ms)
  - `retryDelayMs?: number` - Delay between retries (default: 2000ms)

**Returns:** `Promise<Transaction[]>` - Array of adjacent transactions (children and parent)

---

#### `trackTransactionTree`

```ts
trackTransactionTree(
  address: string,
  hash: string,
  params?: TrackTransactionTreeParams
): Promise<void>
```

Validates the entire transaction tree using BFS (breadth-first search) algorithm, ensuring all transactions in the chain are successful. This method checks compute phase and action phase success for each transaction, throwing detailed errors if any transaction fails.

**Parameters:**
- `address: string` - The contract address as string
- `hash: string` - Root transaction hash to start validation from
- `params?: TrackTransactionTreeParams` - Tracking parameters:
  - `maxDepth?: number` - Maximum tree depth to traverse, inclusive (depth 0 is the root, default: 10)
  - `maxScannedTransactions?: number` - Maximum number of transactions scanned in account history during hash lookup (default: 100)
  - `ignoreOpcodeList?: number[]` - Opcodes that mark transactions as skippable for extra checks (phase validation still applies, default: [0xd53276db])

**Returns:** `Promise<void>` - Resolves if all transactions successful, throws error otherwise

**Error Format:**
```
<txHash>: reason=<reason> (exitCode=<exitCode>, resultCode=<resultCode>) address=<address> hashType=<hashType>
```
`address` and `hashType` are included only for `reason=not_found`.

**Example Error Messages:**
- `abc123...: reason=aborted (exitCode=5, resultCode=37)`
- `def456...: reason=compute_phase_missing (exitCode=N/A, resultCode=N/A)`
- `ghi789...: reason=compute_phase_failed (exitCode=7, resultCode=0)`
- `jkl012...: reason=action_phase_failed (exitCode=0, resultCode=42)`
- `mno345...: reason=not_found (exitCode=N/A, resultCode=N/A) address=EQ... hashType=in`

---

#### `trackTransactionTreeWithResult`

```ts
trackTransactionTreeWithResult(
  address: string,
  hash: string,
  params?: TrackTransactionTreeParams
): Promise<TrackTransactionTreeResult>
```

Validates the entire transaction tree using BFS algorithm and returns a result object instead of throwing errors. Useful when you need to handle validation failures programmatically.

**Parameters:**
- `address: string` - The contract address as string
- `hash: string` - Root transaction hash to start validation from
- `params?: TrackTransactionTreeParams` - Tracking parameters (same as `trackTransactionTree`)

**Returns:** `Promise<TrackTransactionTreeResult>` - Result object with validation status and error details if failed

**TrackTransactionTreeResult:**
```ts
{
  success: boolean;  // Whether all transactions passed validation
  error?: TransactionValidationError;  // Details of first validation error (if any)
}
```

**TransactionValidationError:**
```ts
{
  txHash: string;  // Base64-encoded hash of failed transaction
  exitCode: number | 'N/A';  // Exit code from compute phase
  resultCode: number | 'N/A';  // Result code from action phase
  reason: 'aborted' | 'compute_phase_missing' | 'compute_phase_failed' | 'action_phase_failed' | 'not_found';
  address?: string;  // Address where the lookup happened (for not_found)
  hashType?: 'unknown' | 'in' | 'out';  // Hash type used in lookup (for not_found)
}
```

**Example:**
```ts
const result = await opener.trackTransactionTreeWithResult(address, txHash, { maxDepth: 10 });

if (result.success) {
  console.log('All transactions successful!');
} else {
  console.error('Validation failed:', result.error);
  console.log('Failed transaction:', result.error.txHash);
  console.log('Exit code:', result.error.exitCode);
  console.log('Reason:', result.error.reason);
}
```

---

#### `getTransactionByTxHash`

```ts
getTransactionByTxHash(
  address: Address,
  txHash: string,
  opts?: GetTransactionsOptions
): Promise<Transaction | null>
```

Finds a transaction by its transaction hash specifically (not message hash). This method searches only for exact transaction hash matches.

**Parameters:**
- `address: Address` - The contract address to search transactions for
- `txHash: string` - Transaction hash in base64 format
- `opts?: GetTransactionsOptions` - Optional fetch options (same as `getTransactionByHash`)

**Returns:** `Promise<Transaction | null>` - The found transaction or null if not found within timeout

---

#### `getTransactionByInMsgHash`

```ts
getTransactionByInMsgHash(
  address: Address,
  inMsgHash: string,
  opts?: GetTransactionsOptions
): Promise<Transaction | null>
```

Finds a transaction by its incoming message hash. Useful when you have the message hash but not the transaction hash.

**Parameters:**
- `address: Address` - The contract address to search transactions for
- `inMsgHash: string` - Incoming message hash in base64 format
- `opts?: GetTransactionsOptions` - Optional fetch options (same as `getTransactionByHash`)

**Returns:** `Promise<Transaction | null>` - The found transaction or null if not found within timeout

---

#### `getTransactionByOutMsgHash`

```ts
getTransactionByOutMsgHash(
  address: Address,
  outMsgHash: string,
  opts?: GetTransactionsOptions
): Promise<Transaction | null>
```

Finds a transaction by one of its outgoing message hashes. Useful for tracing transaction chains.

**Parameters:**
- `address: Address` - The contract address to search transactions for
- `outMsgHash: string` - Outgoing message hash in base64 format
- `opts?: GetTransactionsOptions` - Optional fetch options (same as `getTransactionByHash`)

**Returns:** `Promise<Transaction | null>` - The found transaction or null if not found within timeout

---

### Abstract Methods (Must be Implemented)

Each opener implementation must provide these protocol-specific methods:

```ts
abstract open<T extends Contract>(contract: T): OpenedContract<T> | SandboxContract<T>;
abstract getContractState(address: Address): Promise<ContractState>;
abstract getTransactions(address: Address, opts: GetTransactionsOptions): Promise<Transaction[]>;
abstract getAddressInformation(address: Address): Promise<AddressInformation>;
abstract getConfig(): Promise<string>;
```

---

## Opener Implementations

### TonClientOpener

Direct wrapper around `@ton/ton` TonClient for HTTP-based TON blockchain access.

**Usage:**
```ts
import { TonClient } from '@ton/ton';
import { tonClientOpener } from '@tonappchain/sdk';

const client = new TonClient({ endpoint: 'https://toncenter.com/api/v2/jsonRPC' });
const opener = tonClientOpener(client);

// Use opener methods
const state = await opener.getContractState(address);
const tx = await opener.getTransactionByHash(address, hash);
```

**Features:**
- Direct HTTP access to TON blockchain
- Simple configuration with endpoint URL
- Synchronous instantiation (no async factory needed)

---

### OrbsOpener

Uses Orbs network to access TON blockchain via TonClient. Automatically discovers optimal endpoint.

**Usage:**
```ts
import { orbsOpener, Network } from '@tonappchain/sdk';

const opener = await orbsOpener(Network.MAINNET);

// Use opener methods
const adjacent = await opener.getAdjacentTransactions(address, hash);
await opener.trackTransactionTree(address, hash);
```

**Features:**
- Automatic endpoint discovery with retry logic (5 attempts by default)
- Load balancing across Orbs nodes
- Static `create()` factory method for async initialization
- Built-in endpoint retry mechanism with exponential backoff

---

### OrbsOpener4

Uses Orbs network to access TON blockchain via TonClient4 (v4 API). Provides enhanced features and better performance.

**Usage:**
```ts
import { orbsOpener4, Network } from '@tonappchain/sdk';

// Default 10s timeout
const opener = await orbsOpener4(Network.MAINNET);

// Custom timeout
const openerCustom = await orbsOpener4(Network.TESTNET, 15000); // 15s timeout
```

**Features:**
- V4 API support with improved performance
- Configurable request timeout
- Enhanced transaction data format
- Static `create()` factory method
- Automatic endpoint discovery

---

### TonClient4Opener

Uses TonClient4 (v4 API) for direct HTTP access to TON blockchain. Provides a clean wrapper around the v4 protocol.

**Usage:**
```ts
import { TonClient4Opener, tonHubApi4Opener, Network } from '@tonappchain/sdk';

// Option 1: Create with TonHub public endpoint using factory
const opener = tonHubApi4Opener(Network.MAINNET);

// Option 2: Create from existing TonClient4 instance
import { TonClient4 } from '@ton/ton';
const client = new TonClient4({ endpoint: 'https://mainnet-v4.tonhubapi.com', timeout: 10000 });
const opener = TonClient4Opener.create('https://mainnet-v4.tonhubapi.com', 10000);
```

**Features:**
- V4 API support with improved data format
- Direct HTTP access without Orbs network layer
- Configurable request timeout
- Simple endpoint configuration
- **Note**: Public TonHub v4 API has limitations - `getAccountTransactions` and `getConfig` methods may return 404 or timeout errors. For full functionality, use LiteClientOpener or v2-based openers (OrbsOpener, TonClientOpener).

**Factory Functions:**
- `tonHubApi4Opener(network, timeout?)`: Creates opener with TonHub public endpoint
- `TonClient4Opener.create(endpoint, timeout?)`: Creates opener with custom endpoint

---

### LiteClientOpener

Direct connection to TON blockchain lite servers using binary protocol. Provides fastest access but requires more setup.

**Usage:**
```ts
import { liteClientOpener, Network } from '@tonappchain/sdk';

// Option 1: Use default lite servers for network
const opener = await liteClientOpener({ network: Network.MAINNET });

// Option 2: Provide custom lite servers
const opener = await liteClientOpener({
  liteservers: [
    {
      ip: 1234567890,      // Integer IP representation
      port: 12345,
      id: { '@type': 'pub.ed25519', key: 'base64PublicKey...' }
    }
  ]
});

// Don't forget to close connections when done
opener.closeConnections?.();
```

**Features:**
- Direct lite server connection (fastest access)
- Connection pooling with round-robin load balancing
- Static `create()` factory method
- `closeConnections()` method for proper cleanup
- Binary protocol for maximum efficiency

**Important:** Always call `closeConnections()` when done to prevent resource leaks.

---

### SandboxOpener

For testing with `@ton/sandbox` blockchain simulator. Provides limited functionality suitable for unit tests.

**Usage:**
```ts
import { Blockchain } from '@ton/sandbox';
import { sandboxOpener } from '@tonappchain/sdk';

const blockchain = await Blockchain.create();
const opener = sandboxOpener(blockchain);

// Only basic methods work
const state = await opener.getContractState(address);
const config = await opener.getConfig();

// These throw "not implemented" errors
// await opener.getTransactions(address, opts);
// await opener.getTransactionByHash(address, hash);
```

**Note:** Most methods throw "not implemented" errors as sandbox has limited transaction tracking functionality. Use for basic contract state testing only.

---

## RetryableContractOpener

Wrapper that provides automatic retry and fallback logic across multiple openers. Essential for production use to handle network issues and API rate limits.

**Usage:**
```ts
import { RetryableContractOpener, ConsoleLogger } from '@tonappchain/sdk';

const opener = new RetryableContractOpener(
  [
    { opener: await orbsOpener4(network), retries: 5, retryDelay: 1000 },
    { opener: await orbsOpener(network), retries: 5, retryDelay: 1000 },
    { opener: tonClientOpener(client), retries: 3, retryDelay: 500 },
  ],
  new ConsoleLogger()  // optional logger
);

// Automatically retries and falls back on failure
const tx = await opener.getTransactionByHash(address, hash);
```

**Features:**
- Automatic retry on failure with configurable attempts
- Falls back to next opener if all retries fail
- Configurable retry count and delay per opener
- Optional logger integration for debugging
- Transparent operation - same interface as regular openers

**Configuration:**
- `opener`: The ContractOpener instance to use
- `retries`: Number of retry attempts before falling back
- `retryDelay`: Delay in milliseconds between retries

---

## Utility Functions

Common utility functions in `openerUtils.ts` for opener implementations.

### `getHttpEndpointWithRetry`

```ts
getHttpEndpointWithRetry(
  network: Network,
  maxRetries?: number,
  delay?: number
): Promise<string>
```

Gets HTTP endpoint from Orbs network with retry logic. Used internally by `OrbsOpener`.

**Parameters:**
- `network: Network` - Network to connect to (MAINNET/TESTNET)
- `maxRetries?: number` - Maximum retry attempts (default: 5)
- `delay?: number` - Delay between retries in ms (default: 1000)

**Returns:** `Promise<string>` - HTTP endpoint URL

**Throws:** `Error` if all retries fail

---

### `getHttpV4EndpointWithRetry`

```ts
getHttpV4EndpointWithRetry(
  network: Network,
  maxRetries?: number,
  delay?: number
): Promise<string>
```

Gets HTTP V4 endpoint from Orbs network with retry logic. Used internally by `OrbsOpener4`.

**Parameters:** Same as `getHttpEndpointWithRetry`

**Returns:** `Promise<string>` - HTTP V4 endpoint URL

**Throws:** `Error` if all retries fail

---

## Constants

Common constants used by openers (from `src/sdk/Consts.ts`):

```ts
// Maximum depth for transaction tree traversal
export const DEFAULT_FIND_TX_MAX_DEPTH = 10;

// Transaction value to ignore (notification messages)
export const IGNORE_MSG_VALUE_1_NANO = 1n;

// Opcodes to skip extra checks (known system messages)
export const IGNORE_OPCODE = [
  0xd53276db, // Excess message - returns unused TON
];
```

---

## Error Handling

All transaction tree validation errors include comprehensive diagnostic information:

**Error Format:**
```
<txHash>: reason=<reason> (exitCode=<exitCode>, resultCode=<resultCode>) address=<address> hashType=<hashType>
```

**Components:**
- `txHash`: Transaction hash in base64 format for identification
- `reason`: Machine-readable reason of the failure
- `exitCode`: Compute phase exit code (or 'N/A' if unavailable)
- `resultCode`: Action phase result code (or 'N/A' if action phase absent)
- `address` / `hashType`: Present only for `reason=not_found`

**Example Errors:**
```
abc123xyz789...: reason=aborted (exitCode=5, resultCode=37)
def456uvw012...: reason=compute_phase_missing (exitCode=N/A, resultCode=N/A)
ghi789rst345...: reason=compute_phase_failed (exitCode=7, resultCode=0)
jkl012mno678...: reason=action_phase_failed (exitCode=0, resultCode=42)
mno345pqr901...: reason=not_found (exitCode=N/A, resultCode=N/A) address=EQ... hashType=in
```

**Error Handling Example:**
```ts
try {
  await opener.trackTransactionTree(address, hash);
  console.log('All transactions successful!');
} catch (error) {
  // Parse error message for debugging
  const message = error.message;
  console.error('Transaction tree validation failed:', message);

  // Extract exit code and result code for analysis
  const exitCodeMatch = message.match(/exitCode=(\d+|N\/A)/);
  const resultCodeMatch = message.match(/resultCode=(\d+|N\/A)/);

  if (exitCodeMatch) console.log('Exit code:', exitCodeMatch[1]);
  if (resultCodeMatch) console.log('Result code:', resultCodeMatch[1]);
}
```

---

## Example: Creating Custom Opener

Create a custom opener by extending `BaseContractOpener` and implementing only the required abstract methods:

```ts
import { BaseContractOpener } from '@tonappchain/sdk';
import { Address, Contract, OpenedContract, Transaction } from '@ton/ton';

class MyCustomOpener extends BaseContractOpener {
  constructor(private myClient: MyCustomClient, logger?: ILogger) {
    super(logger); // Pass optional logger to base class
  }

  // Implement 5 required abstract methods
  open<T extends Contract>(contract: T): OpenedContract<T> {
    return this.myClient.open(contract);
  }

  async getContractState(address: Address): Promise<ContractState> {
    const state = await this.myClient.getState(address);
    return {
      balance: state.balance,
      state: state.type,
      code: state.code ?? null,
    };
  }

  async getTransactions(
    address: Address,
    opts: GetTransactionsOptions
  ): Promise<Transaction[]> {
    // Map SDK options to your client's API
    let txs = await this.myClient.fetchTransactions(address, {
      limit: opts.limit,
      before: opts.lt,
    });

    // Apply to_lt filter if specified
    if (opts.to_lt) {
      const toLt = BigInt(opts.to_lt);
      txs = txs.filter((tx) => {
        const comparison = tx.lt > toLt;
        return opts.inclusive ? tx.lt >= toLt : comparison;
      });
    }

    return txs;
  }

  async getAddressInformation(address: Address): Promise<AddressInformation> {
    const state = await this.myClient.getState(address);
    return {
      lastTransaction: {
        lt: state.lastTx?.lt ?? '',
        hash: state.lastTx?.hash ?? '',
      },
    };
  }

  async getConfig(): Promise<string> {
    return this.myClient.getBlockchainConfig();
  }

  // Complex methods are inherited automatically!
  // - getTransactionByHash()
  // - getAdjacentTransactions()
  // - trackTransactionTree()
}

// Usage
const myClient = new MyCustomClient({ endpoint: 'https://...' });
const opener = new MyCustomOpener(myClient, new ConsoleLogger());

// All methods work automatically
const tx = await opener.getTransactionByHash(address, hash);
const adjacent = await opener.getAdjacentTransactions(address, hash);
await opener.trackTransactionTree(address, hash);
```

---

## Best Practices

1. **Use RetryableContractOpener for Production**
   - Handles network issues and rate limits automatically
   - Provides fallback to alternative endpoints
   - Essential for reliable production deployments

2. **Configure Multiple Openers as Fallbacks**
   ```ts
   const opener = new RetryableContractOpener([
     { opener: await orbsOpener4(network), retries: 5, retryDelay: 1000 },
     { opener: await orbsOpener(network), retries: 5, retryDelay: 1000 },
     { opener: tonClientOpener(tonCenterClient), retries: 3, retryDelay: 500 },
   ]);
   ```

3. **Set Appropriate Timeouts**
   - Default timeout is 180 seconds (3 minutes)
   - Adjust based on your application's latency requirements
   - Consider network conditions and blockchain load

4. **Use Logger for Debugging**
   ```ts
   import { ConsoleLogger } from '@tonappchain/sdk';
   const logger = new ConsoleLogger();
   const opener = new MyOpener(client, logger);
   ```

5. **Close Connections Properly**
   ```ts
   const opener = await liteClientOpener({ network });
   try {
     // Use opener
     await opener.trackTransactionTree(address, hash);
   } finally {
     opener.closeConnections?.();
   }
   ```

6. **Handle Errors from trackTransactionTree**
   ```ts
   try {
     await opener.trackTransactionTree(address, hash, { maxDepth: 10 });
   } catch (error) {
     console.error('Transaction validation failed:', error.message);
     // Parse exitCode and resultCode from error message
     // Implement retry logic or user notification
   }
   ```

7. **Use Appropriate Opener for Use Case**
   - **Development/Testing**: `SandboxOpener` for unit tests
   - **Production**: `RetryableContractOpener` with multiple fallbacks
   - **High Performance**: `LiteClientOpener` with direct connections
   - **Simplicity**: `OrbsOpener4` with automatic endpoint discovery

---

## Migration from Old Architecture

If you were using the old helper functions, here's how to migrate:

**Before (Old Architecture):**
```ts
import { findTransactionByHash, getAdjacentTransactionsHelper } from './helpers';

// Had to pass opener AND callback function
const tx = await findTransactionByHash(
  opener,
  address,
  hash,
  client.getTransactions.bind(client),
  opts
);

const adjacent = await getAdjacentTransactionsHelper(
  opener,
  address,
  hash,
  client.getTransactions.bind(client),
  opts
);
```

**After (New Architecture):**
```ts
// Methods are now on the opener itself - much simpler!
const tx = await opener.getTransactionByHash(address, hash, opts);
const adjacent = await opener.getAdjacentTransactions(address, hash, opts);
await opener.trackTransactionTree(address, hash, params);
```

**Key Changes:**
- ✅ No more passing callback functions
- ✅ No more passing opener to helper functions
- ✅ All functionality available directly on opener instance
- ✅ Cleaner, more intuitive API
- ✅ Better TypeScript type inference

## See Also

- [Utilities](./utilities.md) - Common utility functions
- [Logger](./logger.md) - Logging configuration
- [TON Transaction Manager](./ton_transaction_manager.md) - Transaction management
