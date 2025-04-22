# SDK Custom Errors

The SDK exports several custom error classes that extend the base JavaScript `Error`. Many inherit from `ErrorWithStatusCode` which includes an `errorCode` property. This allows for more specific error handling.

**Table of Contents**

- [SDK Custom Errors](#sdk-custom-errors)
  - [Base Error](#base-error)
    - [`ErrorWithStatusCode`](#errorwithstatuscode)
  - [Specific Error Types](#specific-error-types)
    - [`ContractError`](#contracterror)
    - [`FetchError`](#fetcherror)
    - [`AddressError`](#addresserror)
    - [`WalletError`](#walleterror)
    - [`KeyError`](#keyerror)
    - [`FormatError`](#formaterror)
    - [`BitError`](#biterror)
    - [`MetadataError`](#metadataerror)
    - [`SettingError`](#settingerror)
    - [`EVMCallError`](#evmcallerror)
  - [Pre-defined Error Instances](#pre-defined-error-instances)

## Base Error

### `ErrorWithStatusCode`

Base class for most SDK errors, providing an additional error code.

- **Properties**:
  - `message` (string)
  - `errorCode` (number)

## Specific Error Types

These classes inherit from `ErrorWithStatusCode` and represent more specific error categories.

### `ContractError`
Errors related to TON smart contract interactions (e.g., contract not found, invalid state, issues during method calls).

### `FetchError`
Errors occurring during network requests, such as fetching data from the Lite Sequencer or a TON API endpoint.

### `AddressError`
Errors related to invalid formatting or usage of TON (TVM) or TAC (EVM) addresses.

### `WalletError`
Errors related to wallet operations or configurations, particularly within the `SenderFactory` (e.g., using an unknown wallet version).

### `KeyError`
Errors related to cryptographic keys, such as invalid mnemonics or unsupported key types.

### `FormatError`
Errors due to incorrectly formatted data, like an invalid EVM method signature string.

### `BitError`
Errors related to bit/byte manipulation, often when data length is not a multiple of 8 bits.

### `MetadataError`
Errors encountered while trying to read or parse token metadata (e.g., from a Jetton master contract).

### `SettingError`
Errors related to accessing configuration settings from the on-chain Settings contracts (on TON or TAC).

### `EVMCallError`
Errors specifically related to the EVM call simulation or execution part of a cross-chain operation.

## Pre-defined Error Instances

The SDK also exports specific instances of the above errors for commonly encountered scenarios. Checking for equality (`===`) with these instances can be useful for handling specific known issues.

- **`emptyContractError`**: (`ContractError`) Contract state is missing or inactive.
- **`operationFetchError`**: (`FetchError`) Failed to fetch operation ID/Type from the Lite Sequencer.
- **`statusFetchError`**: (`FetchError`) Failed to fetch detailed operation status from the Lite Sequencer.
- **`profilingFetchError`**: (`FetchError`) Failed to fetch stage profiling data from the Lite Sequencer.
- **`tvmAddressError`**: (`AddressError`) Invalid TON (TVM) address format detected.
- **`evmAddressError`**: (`AddressError`) Invalid TAC (EVM) address format detected.
- **`unknownWalletError`**: (`WalletError`) Wallet version provided to `SenderFactory` is not recognized/supported.
- **`unsupportedKeyError`**: (`KeyError`) The provided cryptographic key type is not supported.
- **`unsupportedFormatError`**: (`FormatError`) The provided data format is not supported.
- **`notMultiplyOf8Error`**: (`BitError`) Data length must be a multiple of 8 bits.
- **`prefixError`**: (`FormatError`) Data has an incorrect or unexpected prefix.
- **`emptySettingError`**: (`SettingError`) A required setting value retrieved from a Settings contract was unexpectedly empty.
- **`invalidMethodNameError`**: (`FormatError`) The format of the provided EVM method name/signature is invalid.
- **`simulationError`**: (`EVMCallError` or `FetchError`) TAC simulation failed, or the Lite Sequencer could not be reached for simulation.
- **`emptyArrayError`**: (`Error`) An array input (e.g., `operationIds` for batch requests) was unexpectedly empty.

**Example Usage**

```ts
import { TacSdk, Network, AddressError, evmAddressError, FetchError } from '@tonappchain/sdk';

async function checkAddress(sdk: TacSdk, address: string) {
  try {
    // Example: getTVMTokenAddress throws AddressError for invalid EVM format
    const tvmAddress = await sdk.getTVMTokenAddress(address);
    console.log('Valid EVM address, TVM equivalent:', tvmAddress);
  } catch (error) {
    if (error instanceof AddressError) {
      console.error(`Address Error (${error.errorCode}): ${error.message}`);
      // Check if it's the specific pre-defined instance
      if (error === evmAddressError) {
          console.error('---> This is the specific evmAddressError instance.');
      }
    } else if (error instanceof FetchError) { // Example of catching another type
        console.error(`Network Fetch Error (${error.errorCode}): ${error.message}`);
    } else {
      console.error('An unexpected error occurred:', error);
    }
  }
}

async function run() {
  const sdk = await TacSdk.create({ network: Network.TESTNET });
  await checkAddress(sdk, '0x1234567890123456789012345678901234567890'); // Likely valid format
  await checkAddress(sdk, 'invalid-address'); // Invalid format
}

run();
``` 