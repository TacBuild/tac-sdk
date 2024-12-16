# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Method to get TVM address based on EVM address:
    
    ```js
    async getTVMTokenAddress(evmTokenAddress: string): Promise<string> 
    ```

- Tests for SDK methods using contract emulation

- Support for custom contract opener(if no custom opener is specified the default TonClient will be used)

### Removed

- support for TON wallet v1

## [0.3.4] - 2024-12-05

### Added

- code formatting

## [0.3.3] - 2024-12-04

### Added

- support for all versions of TON wallet(v1 - v5)
- SenderFactory to create AbstractSender
