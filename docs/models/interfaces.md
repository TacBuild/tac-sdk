# SDK Interfaces

This file documents the key TypeScript interfaces used within the TAC SDK, primarily for defining contracts for different implementations (like Senders and Contract Openers).

**Table of Contents**

- [SDK Interfaces](#sdk-interfaces)
  - [`ContractOpener`](#contractopener)
  - [`SenderAbstraction`](#senderabstraction)
  - [`WalletInstance`](#walletinstance)

## `ContractOpener`

This interface defines a standard way for the SDK to interact with TON blockchain contracts. It abstracts the underlying connection mechanism.

**Purpose**

- Allows the SDK (`TacSdk.create`) to use different connection methods (HTTP API, LiteServer, Sandbox) consistently.
- Enables users to provide custom connection logic if needed.

**Interface Methods**

- `open<T extends Contract>(contract: T): T`: Takes a contract instance (e.g., from `@ton/ton`) and returns a version of it bound to the opener's provider/client, allowing interaction.
- `getContractState(address: Address | string): Promise<{ balance: bigint; state: 'active' | 'uninitialized' | 'frozen'; code: Buffer | null; }>`: Retrieves the basic state (balance, status, code hash) of a contract at the given address.
- `closeConnections?: () => unknown`: An optional method that specific openers (like `liteClientOpener`) implement to close underlying network connections.

**Usage**

An object implementing this interface is required by `TacSdk.create`. It can be passed within the optional `TONParams` object. If not provided, `TacSdk.create` defaults to using `orbsOpener4`.

## `SenderAbstraction`

Defines the contract for any object that can send transactions for the TacSdk.

**Purpose**

- Provides a consistent way for `TacSdk.sendCrossChainTransaction` to interact with different wallet implementations (like TonConnect or a raw private key).

**Methods**

- `sendShardTransaction(shardTransaction: ShardTransaction, delay: number, chain?: Network, contractOpener?: ContractOpener): Promise<unknown>`:
  - Takes a prepared `ShardTransaction` (containing messages, value, destination) and sends it.
  - `delay`: A delay (in seconds) to wait before performing operations, used to avoid rate limits.
  - `chain` (Network, optional): The target network.
  - `contractOpener` (ContractOpener, optional): Needed by some senders (like `RawSender`) to interact with the wallet contract.
  - Returns a promise that resolves with the result of the send operation (the specific type depends on the implementation).
- `getSenderAddress(): string`:
  - Returns the TON address of the wallet associated with the sender.

**Implementations**: `TonConnectSender`, `RawSender`.

## `WalletInstance`

An interface extending `@ton/ton`'s `Contract` type, specifically requiring methods needed by the `RawSender` to interact with a wallet contract.

**Purpose**

- Ensures that the wallet object passed to `RawSender` has the necessary methods for fetching sequence numbers and sending transfers.

**Required Methods** (in addition to `Contract` methods like `address`):

- `getSeqno(provider: ContractProvider): Promise<number>`: Fetches the current sequence number of the wallet contract.
- `sendTransfer(provider: ContractProvider, args: { seqno: number; secretKey: Buffer; messages: MessageRelaxed[]; sendMode: SendMode; timeout?: number; }): Promise<void>`: Sends a transfer transaction from the wallet.

**Usage**

This interface is primarily used internally by `RawSender`. Instances are typically created using wallet contract classes from `@ton/ton`, such as `WalletContractV4.create(...)`. 