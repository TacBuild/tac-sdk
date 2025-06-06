# SDK Senders

## Table of Contents

- [Overview](#overview)
- [SenderFactory Usage](#senderfactory-usage)
  - [`TonConnectSender`](#tonconnectsender)
  - [`RawSender`](#rawsender)
- [Supported Wallet Versions](#supported-wallet-versions)
- [Errors](#errors)

---

## Overview

Senders are responsible for signing and broadcasting TON-side transactions.  
The SDK abstracts this logic via the `SenderAbstraction` interface.  
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
): Promise<SenderAbstraction>
```

Returns a `SenderAbstraction` based on the provided configuration:

- If `tonConnect` is provided → returns `TonConnectSender`
- If `mnemonic`, `network`, and `version` are provided → returns `RawSender`

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

**Returns:** `Promise<TonConnectSender extends SenderAbstraction>`

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

**Returns:** `Promise<RawSender extends SenderAbstraction>`

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

These versions are supported in `RawSender` configuration.

---

## Errors

- `WalletError`: thrown if an invalid wallet version is provided in `RawSender` setup.