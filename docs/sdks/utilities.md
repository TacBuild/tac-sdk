### `startTracking`

```ts
startTracking(
  transactionLinker: TransactionLinker,
  network: Network,
  options?: {
    customLiteSequencerEndpoints?: string[];
    delay?: number;
    maxIterationCount?: number;
    returnValue?: boolean;
    tableView?: boolean;
    txFinalizerConfig?: {
      urlBuilder: (hash: string) => string;
      authorization: { header: string; value: string };
    };
    logger?: ILogger;
  }
): Promise<void | ExecutionStages>
```

Tracks a crosschain operation end-to-end by polling the status using the transaction linker.  
It will continue until a final state (success or failure) is reached.

If the operation includes a TON-side execution (EXECUTED_IN_TON stage), and `txFinalizerConfig` is provided, the [TonTxFinalizer](#tontxfinalizer) will be used to verify the final TON transaction(s) for success.

#### Parameters:
- `transactionLinker`: Result of `sendCrossChainTransaction(...)`
- `network`: `Network.TESTNET` or `Network.MAINNET`
- `options` *(optional)*:
  - `customLiteSequencerEndpoints`: override default sequencer URL
  - `delay`: polling interval in seconds (default: 10)
  - `maxIterationCount`: max polling attempts (default: 120)
  - `returnValue`: if `true`, returns profiling data instead of logging (default: `false`)
  - `tableView`: if `true`, logs formatted table output (default: `true`)
  - `txFinalizerConfig`: (optional) configuration for [TonTxFinalizer](#tontxfinalizer) to verify TON transaction success
  - `logger`: custom logger instance for debug messages (default: NoopLogger)

#### Returns:
- `Promise<void>` if `returnValue` is `false`
- `Promise<ExecutionStages>` if `returnValue` is `true`

#### Possible exceptions:
- `FetchError`: if operation status or ID could not be fetched from sequencer
- `Error`: if TON transaction fails verification (when using TonTxFinalizer)

#### Example:
```ts
await startTracking(transactionLinker, Network.TESTNET, {
  txFinalizerConfig: {
    urlBuilder: (hash) => `https://testnet.toncenter.com/api/v3/adjacentTransactions?hash=${encodeURIComponent(hash)}&direction=out`,
    authorization: { header: 'X-API-Key', value: 'your-api-key' }
  },
  logger: new ConsoleLogger()
});
```

### `startTrackingMultiple`

```ts
startTrackingMultiple(
  transactionLinkers: TransactionLinker[],
  network: Network,
  options?: {
    customLiteSequencerEndpoints?: string[];
    delay?: number;
    maxIterationCount?: number;
    returnValue?: boolean;
    tableView?: boolean;
    txFinalizerConfig?: {
      urlBuilder: (hash: string) => string;
      authorization: { header: string; value: string };
    };
    logger?: ILogger;
  }
): Promise<void | ExecutionStages[]>
```

Tracks multiple crosschain operations in parallel by polling their statuses using transaction linkers.  
Each operation will be tracked until it reaches a final state (success or failure).

If any operation includes a TON-side execution (EXECUTED_IN_TON stage), and `txFinalizerConfig` is provided, the [TonTxFinalizer](#tontxfinalizer) will be used to verify the final TON transaction(s) for success.

#### Parameters:
- `transactionLinkers`: Array of results from `sendCrossChainTransaction(...)`
- `network`: `Network.TESTNET` or `Network.MAINNET`
- `options` *(optional)*:
  - `customLiteSequencerEndpoints`: override default sequencer URL
  - `delay`: polling interval in seconds (default: 10)
  - `maxIterationCount`: max polling attempts (default: 120)
  - `returnValue`: if `true`, returns array of profiling data instead of logging (default: `false`)
  - `tableView`: if `true`, logs formatted table output for each operation (default: `true`)
  - `txFinalizerConfig`: (optional) configuration for [TonTxFinalizer](#tontxfinalizer) to verify TON transaction success
  - `logger`: custom logger instance for debug messages (default: NoopLogger)

#### Returns:
- `Promise<void>` if `returnValue` is `false`
- `Promise<ExecutionStages[]>` if `returnValue` is `true`

#### Possible exceptions:
- `FetchError`: if operation status or ID could not be fetched from sequencer
- `Error`: if TON transaction fails verification (when using TonTxFinalizer)

#### Example:
```ts
await startTrackingMultiple([transactionLinker1, transactionLinker2], Network.TESTNET, {
  txFinalizerConfig: {
    urlBuilder: (hash) => `https://testnet.toncenter.com/api/v3/adjacentTransactions?hash=${encodeURIComponent(hash)}&direction=out`,
    authorization: { header: 'X-API-Key', value: 'your-api-key' }
  },
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

### `TonTxFinalizer`

`TonTxFinalizer` is a utility for verifying the finality and success of TON transactions by traversing the transaction tree using the TON Center API (or a custom API).

#### Constructor
```ts
new TonTxFinalizer(
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
- `trackTransactionTree(hash: string, maxDepth?: number): Promise<void>`
  - Traverses the transaction tree starting from the given hash, following outgoing transactions up to `maxDepth` (default: 10)
  - Throws an error if any transaction in the tree is not successful

#### Example
```ts
const finalizer = new TonTxFinalizer({
  urlBuilder: (hash) => `https://testnet.toncenter.com/api/v3/adjacentTransactions?hash=${encodeURIComponent(hash)}&direction=out`,
  authorization: { header: 'X-API-Key', value: 'your-api-key' }
}, new ConsoleLogger());

await finalizer.trackTransactionTree('TON_TX_HASH');
```
