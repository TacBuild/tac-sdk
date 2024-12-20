# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Method to get TVM address based on EVM address:
    
    ```typescript
    async getTVMTokenAddress(evmTokenAddress: string): Promise<string> 
    ```

- Tests for SDK methods using contract emulation

- Support for custom contract opener(if no custom opener is specified the default TonClient will be used)

- SDK uses @tonappchain/artifacts

- Extended signature of getEVMTokenAddress and getTVMTokenAddress method to support calculation for native tokens:

    ```typescript
    async getEVMTokenAddress(tvmTokenAddress: string | typeof NATIVE_TON_ADDRESS): Promise<string>

    async getTVMTokenAddress(evmTokenAddress: string | typeof NATIVE_TAC_ADDRESS): Promise<string>
    ```

- Added exported constants to support update specified above:

    ```typescript
    export const NATIVE_TON_ADDRESS = 'NONE'; // Used to calculate address of TON Coin on TAC Chain
    export const NATIVE_TAC_ADDRESS = '0x1AC0000000000000000000000000000000000000'; // Used to calculate address of TAC Coin on TON Chain
    ```

### Removed

- support for TON wallet v1

## [0.3.4] - 2024-12-05

### Added

- code formatting

## [0.3.3] - 2024-12-04

### Added

- support for all versions of TON wallet(v1 - v5)
- SenderFactory to create AbstractSender
