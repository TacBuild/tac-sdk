# Changelog

All notable changes to this project will be documented in this file.

## [0.3.7] - 2025-01-20

### Added

- section in readme about TACHeader
- addLiquidity uniswap_v2 test

### Changed

- `address` field in `AssetBridgingData` can be either EVM or TVM address
- Method `SenderFactory.getSender` requires additional parameter `network` when creating wallet wrapper using mnemonic
- Fixed `getContractState` in `liteClientOpener`
- Fixed all tests for TACHeader logic

### Removed

- Deleted test bridgeData


## [0.3.6] - 2025-01-15

### Changed

- Calculate token addresses through emulation
- Renamed `TransactionStatus` to `OperationTracker`
- Renamed method `OperationTracker.getStatusTransaction()` to `OperationTracker.getOperationStatus()`
- Renamed method `OperationTracker.getSimpifiedTransactionStatus()` to `OperationTracker.getSimplifiedOperationStatus()`
- Renamed `TacSDKTonClientParams` to `SDKParams`
- Changed struct of `SDKParams`
- Changed `ton-lite-client` library to its fork `@tonappchain/ton-lite-client`

### Added

- Custom `TONParams` and `TACParams` in `SDKParams`
- `network` and `customLiteSequencerEndpoints` params to `OperationTracker` constructor
- Static async function `create` in `TacSdk` for creating an instance of `TacSdk`
- Custom errors
- Methods that may construct custom contractOpener for TacSDK. Currently, it provides methods for Sandbox(without export from SDK) and LiteClient openers creation.

    ```typescript
        export async function liteClientOpener(
            options: { liteservers: LiteServer[] } | { network: Network },
        ): Promise<ContractOpener>

        export function sandboxOpener(blockchain: Blockchain): ContractOpener;
    ```
- Method `closeConnections` in `TacSdk` for closing all network connections, e.g. to liteclients, if required
- Optional method `closeConnections` to `ContractOpener` interface which is called in `TacSdk.closeConnections` method

### Removed

- `init` function in `TacSdk`
- public constructor of `TacSdk`


## [0.3.5] - 2024-12-20

### Added

- Method to get TVM address based on EVM address:
    
    ```typescript
    async getTVMTokenAddress(evmTokenAddress: string): Promise<string> 
    ```

- Tests for SDK methods using contract emulation

- Support for custom contract opener(if no custom opener is specified the default TonClient will be used)

- SDK uses @tonappchain/artifacts

- Added get methods for native token addresses:

    ```typescript
        get nativeTONAddress() {
            return 'NONE';
        }

        get nativeTACAddress(): Promise<string> {
            return this.TACCrossChainLayer.NATIVE_TOKEN_ADDRESS.staticCall();
        }
    ```

- Added support for native token address calculation in *getEVMTokenAddress* and *getTVMTokenAddress* methods.

### Removed

- support for TON wallet v1

## [0.3.4] - 2024-12-05

### Added

- code formatting

## [0.3.3] - 2024-12-04

### Added

- support for all versions of TON wallet(v1 - v5)
- SenderFactory to create AbstractSender
