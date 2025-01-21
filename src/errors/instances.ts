import {
    ContractError,
    FetchError,
    AddressError,
    WalletError,
    KeyError,
    FormatError,
    BitError,
    MetadataError,
    SettingError,
    EVMCallError
} from './errors';

export const emptyContractError = new ContractError('unexpected empty contract code of given jetton.', 100);

export const operationFetchError = new FetchError('failed to fetch OperationId', 101);

export const statusFetchError = new FetchError('failed to fetch status transaction', 102);

export const tvmAddressError = (addr: string) => new AddressError(`invalid tvm address ${addr}`, 103);

export const evmAddressError = (addr: string) => new AddressError(`invalid evm address ${addr}`, 104);

export const unknownWalletError = (version: string) => new WalletError(`Unknown wallet version ${version}`, 105);

export const unsupportedKeyError = (key: string) => new KeyError(`Unsupported onchain key: ${key}`, 106);

export const unsupportedFormatError = new FormatError('Only snake format is supported', 107);

export const notMultiplyOf8Error = new BitError('Number remaining of bits is not multiply of 8', 108);

export const prefixError = new MetadataError('Unexpected wrappers metadata content prefix', 109);

export const emptySettingError = (setting: string) =>
    new SettingError(`unexpected empty ${setting}. Make sure the settings contract is valid.`, 110);

export const invalidMethodNameError = (methodName: string) =>
    new EVMCallError(`Invalid Solidity method name: "${methodName}". Method must be either a valid identifier or have parameters (bytes, bytes).`, 110);
