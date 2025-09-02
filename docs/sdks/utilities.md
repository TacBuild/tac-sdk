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
      apiConfig: {
        urlBuilder: (hash: string) => string;
        authorization: { header: string; value: string };
      };
      debug?: boolean;
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
    apiConfig: {
      urlBuilder: (hash) => `https://testnet.toncenter.com/api/v3/adjacentTransactions?hash=${encodeURIComponent(hash)}&direction=out`,
      authorization: { header: 'X-API-Key', value: 'your-api-key' }
    },
    debug: true
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
      apiConfig: {
        urlBuilder: (hash: string) => string;
        authorization: { header: string; value: string };
      };
      debug?: boolean;
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
    apiConfig: {
      urlBuilder: (hash) => `https://testnet.toncenter.com/api/v3/adjacentTransactions?hash=${encodeURIComponent(hash)}&direction=out`,
      authorization: { header: 'X-API-Key', value: 'your-api-key' }
    },
    debug: true
  },
  logger: new ConsoleLogger()
});
```

---

### `TonTxFinalizer`

`TonTxFinalizer` is a utility for verifying the finality and success of TON transactions by traversing the transaction tree using the TON Center API (or a custom API).

#### Constructor
```ts
new TonTxFinalizer(
  apiConfig?: {
    urlBuilder: (hash: string) => string;
    authorization: { header: string; value: string };
  },
  debug?: boolean
)
```
- `apiConfig.urlBuilder`: Function to build the API URL for fetching adjacent transactions by hash
- `apiConfig.authorization`: Object specifying the header and value for API authorization
- `debug`: If true, enables verbose logging

#### Methods
- `trackTransactionTree(hash: string, maxDepth?: number): Promise<void>`
  - Traverses the transaction tree starting from the given hash, following outgoing transactions up to `maxDepth` (default: 10)
  - Throws an error if any transaction in the tree is not successful

#### Example
```ts
const finalizer = new TonTxFinalizer({
  urlBuilder: (hash) => `https://testnet.toncenter.com/api/v3/adjacentTransactions?hash=${encodeURIComponent(hash)}&direction=out`,
  authorization: { header: 'X-API-Key', value: 'your-api-key' }
}, true);

await finalizer.trackTransactionTree('TON_TX_HASH');
```
