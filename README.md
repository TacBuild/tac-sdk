# TAC-SDK

[![Version npm](https://img.shields.io/npm/v/tac-sdk.svg?logo=npm)](https://www.npmjs.com/package/tac-sdk)

SDK for cross-chain transactions from TVM to EVM.

The main idea of SDK is to help EVM developers with cross-chain transactions from TVM to EVM. EVM-developer should
specify a few things:
1. The address of contract to interact with
2. Which method to use on the contract
3. What parameters need to be passed to contract

Then SDK will use these parameters to build a correct transaction for TON, i.e. it will build the payload and give it to the TON for further
signature via ton-connect.

EVM-developer will not need to know the details of working with TON except ton-connect.

## Features
TON:
* Get user jetton balance 
* Cross-chain payload generation
* Jetton transfers


## Install

```bash
npm install tac-sdk
```

## Usage

To use this library you need HTTP API endpoint, you can use one of the public endpoints:

- Mainnet: https://toncenter.com/api/v2/jsonRPC
- Testnet: https://testnet.toncenter.com/api/v2/jsonRPC

```typescript


```

## License

MIT
