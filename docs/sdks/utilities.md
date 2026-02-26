### `startTracking`

```ts
startTracking(
  transactionLinker: TransactionLinkerWithOperationId,
  network: Network,
  options?: {
    customLiteSequencerEndpoints?: string[];
    delay?: number;
    maxIterationCount?: number;
    returnValue?: boolean;
    tableView?: boolean;
    logger?: ILogger;
    txFinalizer?: ITxFinalizer;
    cclAddress?: string;
  }
): Promise<void | ExecutionStages>
```

Tracks a crosschain operation end-to-end by polling the status using the transaction linker.  
It will continue until a final state (success or failure) is reached.

If the operation includes a TON-side execution (EXECUTED_IN_TON stage), and `txFinalizer` and `cclAddress` are provided, the finalizer will be used to verify the final TON transaction(s) for success.

#### Parameters:
- `transactionLinker`: Result of `sendCrossChainTransaction(...)`. If `operationId` is already set, `startTracking` will use it and skip `getOperationId(...)` request.
- `network`: `Network.TESTNET` or `Network.MAINNET`
- `options` *(optional)*:
  - `customLiteSequencerEndpoints`: override default sequencer URL
  - `delay`: polling interval in seconds (default: 10)
  - `maxIterationCount`: max polling attempts (default: 120)
  - `returnValue`: if `true`, returns profiling data instead of logging (default: `false`)
  - `tableView`: if `true`, logs formatted table output (default: `true`)
  - `logger`: custom logger instance for debug messages (default: NoopLogger)
  - `txFinalizer`: (optional) `ITxFinalizer` instance to verify TON transaction success (e.g., `TonTxFinalizer`)
  - `cclAddress`: (optional) Cross-chain layer address for transaction verification

#### Returns:
- `Promise<void>` if `returnValue` is `false`
- `Promise<ExecutionStages>` if `returnValue` is `true`

#### Possible exceptions:
- `FetchError`: if operation status or ID could not be fetched from sequencer. Includes `errorCode`, HTTP status as `httpStatus` (when available), `innerErrorCode`, `innerMessage`, and optional `innerStack` (trace). `innerStack` is included only when `waitOptions.includeErrorTrace = true`. Use `error.toDebugString(true)` to print full details with trace.
- `Error`: if TON transaction fails verification (when using txFinalizer)

#### Example:
```ts
import { TonIndexerTxFinalizer, ConsoleLogger } from '@tonappchain/sdk';

const finalizer = new TonIndexerTxFinalizer({
  urlBuilder: (hash) => `https://testnet.toncenter.com/api/v3/adjacentTransactions?hash=${encodeURIComponent(hash)}&direction=out`,
  authorization: { header: 'X-API-Key', value: 'your-api-key' }
}, new ConsoleLogger());

await startTracking(transactionLinker, Network.TESTNET, {
  txFinalizer: finalizer,
  cclAddress: 'EQB3ncyBUTjZUA5EnFKR5_EnOMI9V1tTEAAPaiU71gc4TiUt',
  logger: new ConsoleLogger()
});
```

### `startTrackingMultiple`

```ts
startTrackingMultiple(
  transactionLinkers: TransactionLinkerWithOperationId[],
  network: Network,
  options?: {
    customLiteSequencerEndpoints?: string[];
    delay?: number;
    maxIterationCount?: number;
    returnValue?: boolean;
    tableView?: boolean;
    logger?: ILogger;
    txFinalizer?: ITxFinalizer;
  }
): Promise<void | ExecutionStages[]>
```

Tracks multiple crosschain operations in parallel by polling their statuses using transaction linkers.  
Each operation will be tracked until it reaches a final state (success or failure).

If any operation includes a TON-side execution (EXECUTED_IN_TON stage), and `txFinalizer` is provided, the finalizer will be used to verify the final TON transaction(s) for success.

#### Parameters:
- `transactionLinkers`: Array of results from `sendCrossChainTransaction(...)`. If an item already has `operationId`, it will be used directly.
- `network`: `Network.TESTNET` or `Network.MAINNET`
- `options` *(optional)*:
  - `customLiteSequencerEndpoints`: override default sequencer URL
  - `delay`: polling interval in seconds (default: 10)
  - `maxIterationCount`: max polling attempts (default: 120)
  - `returnValue`: if `true`, returns array of profiling data instead of logging (default: `false`)
  - `tableView`: if `true`, logs formatted table output for each operation (default: `true`)
  - `logger`: custom logger instance for debug messages (default: NoopLogger)
  - `txFinalizer`: (optional) `ITxFinalizer` instance to verify TON transaction success (e.g., `TonTxFinalizer`)

#### Returns:
- `Promise<void>` if `returnValue` is `false`
- `Promise<ExecutionStages[]>` if `returnValue` is `true`

#### Possible exceptions:
- `FetchError`: if operation status or ID could not be fetched from sequencer. Includes `errorCode`, HTTP status as `httpStatus` (when available), `innerErrorCode`, `innerMessage`, and optional `innerStack` (trace). `innerStack` is included only when `waitOptions.includeErrorTrace = true`. Use `error.toDebugString(true)` to print full details with trace.
- `Error`: if TON transaction fails verification (when using txFinalizer)

#### Example:
```ts
import { TonIndexerTxFinalizer, ConsoleLogger } from '@tonappchain/sdk';

const finalizer = new TonIndexerTxFinalizer({
  urlBuilder: (hash) => `https://testnet.toncenter.com/api/v3/adjacentTransactions?hash=${encodeURIComponent(hash)}&direction=out`,
  authorization: { header: 'X-API-Key', value: 'your-api-key' }
}, new ConsoleLogger());

await startTrackingMultiple([transactionLinker1, transactionLinker2], Network.TESTNET, {
  txFinalizer: finalizer,
  logger: new ConsoleLogger()
});
```

---

### `normalizeAsset`

```ts
normalizeAsset(config: IConfiguration, input: AssetLike): Promise<Asset>
```

Converts a single `AssetLike` object into a proper `Asset` instance that can be used by the SDK. This utility function handles various input formats and automatically determines the appropriate asset type and configuration.

#### Parameters:
- `config`: SDK configuration instance containing network settings and contract information
- `input`: An `AssetLike` object that can be:
  - An existing `Asset` instance (returned as-is)
  - An object with `itemIndex` (treated as NFT from collection)
  - An object with address and amount/rawAmount (treated as FT)
  - An object with just address (treated as NFT item)

#### Returns:
`Promise<Asset>` - A properly configured Asset instance

#### Logic:
1. If input is already an Asset (has `generatePayload` function), returns it directly
2. If input has `itemIndex`, creates an NFT asset from a collection
3. First attempts to create an FT asset, applying amount/rawAmount if specified
4. If FT creation fails, falls back to creating an NFT item asset

#### Example:
```ts
import { normalizeAsset } from '@tonappchain/sdk/utils';

// FT with amount
const ftAsset = await normalizeAsset(config, {
  address: "EQC_1YoM8RBixN95lz7odcF3Vrkc_N8Ne7gQi7Abtlet_Efi",
  amount: 1.5
});

// NFT from collection
const nftAsset = await normalizeAsset(config, {
  address: "EQD-cvR0Nz6XAyRBpUzoMAC1b4-jXqZtUgSxhFfHWA7xAPgm",
  itemIndex: 42n
});
```

### `normalizeAssets`

```ts
normalizeAssets(config: IConfiguration, assets?: AssetLike[]): Promise<Asset[]>
```

Converts an array of `AssetLike` objects into proper `Asset` instances. This is a convenience function that applies `normalizeAsset` to each element in the array.

#### Parameters:
- `config`: SDK configuration instance containing network settings and contract information  
- `assets`: Optional array of `AssetLike` objects to normalize

#### Returns:
`Promise<Asset[]>` - Array of properly configured Asset instances. Returns empty array if input is undefined or empty.

#### Example:
```ts
import { normalizeAssets } from '@tonappchain/sdk/utils';

const assets = await normalizeAssets(config, [
  { address: "EQC_1YoM8RBixN95lz7odcF3Vrkc_N8Ne7gQi7Abtlet_Efi", amount: 1.5 },
  { address: "EQD-cvR0Nz6XAyRBpUzoMAC1b4-jXqZtUgSxhFfHWA7xAPgm", itemIndex: 42n },
  { rawAmount: 1000000000n } // Native TON
]);
```

---

### `TonIndexerTxFinalizer`

`TonIndexerTxFinalizer` is a utility for verifying the finality and success of TON transactions by traversing the transaction tree using the TON Center API (or a custom API).

#### Constructor
```ts
new TonIndexerTxFinalizer(
  apiConfig: {
    urlBuilder: (hash: string) => string;
    authorization: { header: string; value: string };
  },
  logger?: ILogger,
  httpClient?: IHttpClient
)
```
- `apiConfig.urlBuilder`: Function to build the API URL for fetching adjacent transactions by hash
- `apiConfig.authorization`: Object specifying the header and value for API authorization
- `logger`: Optional logger implementing ILogger. Pass a ConsoleLogger to enable verbose output; defaults to NoopLogger
- `httpClient`: Optional HTTP client for making API requests; defaults to AxiosHttpClient

#### Methods
- `trackTransactionTree(address: string, hash: string, maxDepth?: number): Promise<void>`
  - Traverses the transaction tree starting from the given address and hash, following outgoing transactions up to `maxDepth` inclusive (depth 0 is the root, default: 10)
  - Throws an error if any transaction in the tree is not successful or if a hash is not found

#### Example
```ts
const finalizer = new TonIndexerTxFinalizer({
  urlBuilder: (hash) => `https://testnet.toncenter.com/api/v3/adjacentTransactions?hash=${encodeURIComponent(hash)}&direction=out`,
  authorization: { header: 'X-API-Key', value: 'your-api-key' }
}, new ConsoleLogger());

await finalizer.trackTransactionTree('EQB3ncyBUTjZUA5EnFKR5_EnOMI9V1tTEAAPaiU71gc4TiUt', 'TON_TX_HASH');
```

---

### `TonTxFinalizer`

`TonTxFinalizer` is a utility for verifying the finality and success of TON transactions by traversing the transaction tree using a `ContractOpener` interface. This implementation works directly with TON network clients (like TonClient) to fetch and verify transactions.

#### Constructor
```ts
new TonTxFinalizer(
  contractOpener: ContractOpener,
  logger?: ILogger
)
```
- `contractOpener`: A `ContractOpener` instance used to fetch adjacent transactions from the TON network
- `logger`: Optional logger implementing `ILogger`. Pass a `ConsoleLogger` to enable verbose output; defaults to `NoopLogger`

#### Methods
- `trackTransactionTree(address: string, hash: string, params: { maxDepth?: number; maxScannedTransactions?: number }): Promise<void>`
  - Traverses the transaction tree starting from the given address and hash, following outgoing transactions up to `maxDepth` inclusive (depth 0 is the root, default: 10)
  - `maxScannedTransactions` limits hash-history scanning per lookup (default: 100)
  - Uses the `ContractOpener` to fetch adjacent transactions via `getAdjacentTransactions` method
  - Throws an error if any transaction in the tree is not successful or if a hash is not found
  - Automatically retries on rate limit errors (429) and handles 404 errors gracefully

#### Example
```ts
import { TonTxFinalizer, ConsoleLogger, Configuration, Network } from '@tonappchain/sdk';
import { TonClient } from '@ton/ton';

// Create a contract opener (example using TonClient)
const client = new TonClient({
  endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC'
});
const contractOpener = {
  open: (src) => client.open(src),
  getContractState: (address) => client.getContractState(address),
  getAdjacentTransactions: (address, hash, opts) => client.getAdjacentTransactions(address, hash, opts),
  getTransactionByHash: (address, hash, opts) => client.getTransactionByHash(address, hash, opts),
  getAddressInformation: (address) => client.getAddressInformation(address)
};

// Create TonTxFinalizer
const finalizer = new TonTxFinalizer(contractOpener, new ConsoleLogger());

// Track transaction tree
await finalizer.trackTransactionTree(
  'EQB3ncyBUTjZUA5EnFKR5_EnOMI9V1tTEAAPaiU71gc4TiUt', 
  'TON_TX_HASH',
  { maxDepth: 10, maxScannedTransactions: 100 }
);
```

#### Differences from `TonIndexerTxFinalizer`

- **`TonTxFinalizer`**: Uses `ContractOpener` interface to work directly with TON network clients. Requires an address parameter for transaction lookup.

- **`TonIndexerTxFinalizer`**: Uses HTTP API (like TON Center API) with custom URL builder and authorization. Does not require address parameter.
