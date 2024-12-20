# Changelog

All notable changes to this project will be documented in this file.

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
