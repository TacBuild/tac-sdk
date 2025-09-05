# SDK Senders

## Table of Contents

- [SDK Senders](#sdk-senders)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [SenderFactory Usage](#senderfactory-usage)
    - [`TonConnectSender`](#tonconnectsender)
    - [`RawSender`](#rawsender)
    - [`BatchSender`](#batchsender)
  - [Supported Wallet Versions](#supported-wallet-versions)
  - [ISender Interface](#isender-interface)
  - [Errors](#errors)

---

## Overview

Senders are responsible for signing and broadcasting TON-side transactions.  
The SDK abstracts this logic via the `ISender` interface.  
Senders are obtained through `SenderFactory.getSender(...)`.

---

## SenderFactory Usage

```ts
SenderFactory.getSender(
  params:
    | {
        network: Network;
        version: WalletVersion;
        mnemonic: string;
        options?: {
          v5r1?: { subwalletNumber?: number };
          highloadV3?: { subwalletId?: number; timeout?: number };
        };
      }
    | { tonConnect: TonConnectUI }
): Promise<ISender>
```

Returns a `ISender` based on the provided configuration:

- If `tonConnect` is provided → returns `TonConnectSender`
- If `mnemonic`, `network`, and `version` are provided → returns `RawSender` or `BatchSender`
  - Returns `BatchSender` for `HIGHLOAD_V3` wallet version
  - Returns `RawSender` for all other wallet versions

---

### `TonConnectSender`

Used to send transactions via [TonConnect UI](https://ton.org/ton-connect). Ideal for browser-based wallets.

**Example**:

```ts
import { SenderFactory } from "@tonappchain/sdk";
import { TonConnectUI } from "@tonconnect/ui";

const tonConnect = new TonConnectUI();
const sender = await SenderFactory.getSender({
  tonConnect,
});
```

**Returns:** `Promise<TonConnectSender extends ISender>`

**Methods:**
- `sendShardTransaction`: Sends a single shard transaction
- `sendShardTransactions`: Sends multiple shard transactions with chunking support
- `getSenderAddress`: Returns the sender's address
- `getBalance`: Gets the TON balance of the sender
- `getBalanceOf`: Gets the balance of a specific asset for the sender

---

### `RawSender`

Used to send transactions directly from a wallet derived via mnemonic.

**Example**:

```ts
import { Network, SenderFactory } from "@tonappchain/sdk";

const walletVersion = 'v4';
const mnemonic = process.env.TVM_MNEMONICS || ''; // 24 words mnemonic
const network = Network.TESTNET;
const sender = await SenderFactory.getSender({
    version: walletVersion,
    mnemonic,
    network,
});

```

**Returns:** `Promise<RawSender extends ISender>`

**Methods:**
- `sendShardTransaction`: Sends a single shard transaction
- `sendShardTransactions`: Sends multiple shard transactions with batching support
- `getSenderAddress`: Returns the sender's address
- `getBalance`: Gets the TON balance of the sender
- `getBalanceOf`: Gets the balance of a specific asset for the sender

Note on batching:
- RawSender groups outbound messages into batches when sending multiple shard transactions.
- Max batch size depends on wallet version: 254 for `V5R1`, 4 for others.

---

### `BatchSender`

Used for high-performance batch transactions with `HIGHLOAD_V3` wallet. Automatically handles message grouping and external message size limits.

**Example**:

```ts
import { Network, SenderFactory } from "@tonappchain/sdk";

const walletVersion = 'HIGHLOAD_V3';
const mnemonic = process.env.TVM_MNEMONICS || ''; // 24 words mnemonic
const network = Network.TESTNET;
const sender = await SenderFactory.getSender({
    version: walletVersion,
    mnemonic,
    network,
    options: {
        highloadV3: {
            subwalletId: 0,
            timeout: 60
        }
    }
});
```

**Returns:** `Promise<BatchSender extends ISender>`

**Methods:**
- `sendShardTransaction`: Sends a single shard transaction
- `sendShardTransactions`: Sends multiple shard transactions with advanced grouping
- `getSenderAddress`: Returns the sender's address
- `getBalance`: Gets the TON balance of the sender
- `getBalanceOf`: Gets the balance of a specific asset for the sender

---

## Supported Wallet Versions

```ts
type WalletVersion =
  | "V2R1"
  | "V2R2"
  | "V3R1"
  | "V3R2"
  | "V4"
  | "V5R1"
  | "HIGHLOAD_V3";
```

These versions are supported in `RawSender` and `BatchSender` configuration:
- `V2R1`, `V2R2`, `V3R1`, `V3R2`, `V4`, `V5R1` → Uses `RawSender`
- `HIGHLOAD_V3` → Uses `BatchSender` for high-performance batch transactions

---

## ISender Interface

All senders implement the `ISender` interface:

```ts
interface ISender {
  sendShardTransaction(
    shardTransaction: ShardTransaction,
    chain?: Network,
    contractOpener?: IContractOpener
  ): Promise<SendResult>;
  
  sendShardTransactions(
    shardTransactions: ShardTransaction[],
    chain?: Network,
    contractOpener?: IContractOpener
  ): Promise<SendResult[]>;
  
  getSenderAddress(): string;
  getBalance(contractOpener: IContractOpener): Promise<bigint>;
  getBalanceOf(asset: IAsset): Promise<bigint>;
}
```

## Errors

- `WalletError`: thrown if an invalid wallet version is provided in `RawSender` setup.