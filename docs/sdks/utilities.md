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
  }
): Promise<void | ExecutionStages>
```

Tracks a crosschain operation end-to-end by polling the status using the transaction linker.  
It will continue until a final state (success or failure) is reached.

#### Parameters:
- `transactionLinker`: Result of `sendCrossChainTransaction(...)`
- `network`: `Network.TESTNET` or `Network.MAINNET`
- `options` *(optional)*:
  - `customLiteSequencerEndpoints`: override default sequencer URL
  - `delay`: polling interval in seconds (default: 10)
  - `maxIterationCount`: max polling attempts (default: 120)
  - `returnValue`: if `true`, returns profiling data instead of logging (default: `false`)
  - `tableView`: if `true`, logs formatted table output (default: `true`)

#### Returns:
- `Promise<void>` if `returnValue` is `false`
- `Promise<ExecutionStages>` if `returnValue` is `true`

#### Possible exceptions:
- `FetchError`: if operation status or ID could not be fetched from sequencer

#### Example:
```ts
await startTracking(transactionLinker, Network.TESTNET);
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
  }
): Promise<void | ExecutionStages[]>
```

Tracks multiple crosschain operations in parallel by polling their statuses using transaction linkers.  
Each operation will be tracked until it reaches a final state (success or failure).

#### Parameters:
- `transactionLinkers`: Array of results from `sendCrossChainTransaction(...)`
- `network`: `Network.TESTNET` or `Network.MAINNET`
- `options` *(optional)*:
  - `customLiteSequencerEndpoints`: override default sequencer URL
  - `delay`: polling interval in seconds (default: 10)
  - `maxIterationCount`: max polling attempts (default: 120)
  - `returnValue`: if `true`, returns array of profiling data instead of logging (default: `false`)
  - `tableView`: if `true`, logs formatted table output for each operation (default: `true`)

#### Returns:
- `Promise<void>` if `returnValue` is `false`
- `Promise<ExecutionStages[]>` if `returnValue` is `true`

#### Possible exceptions:
- `FetchError`: if operation status or ID could not be fetched from sequencer

#### Example:
```ts
await startTrackingMultiple([transactionLinker1, transactionLinker2], Network.TESTNET);
```
