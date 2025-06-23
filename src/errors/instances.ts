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
    EVMCallError,
    NoValidGroupFoundError,
    PrepareMessageGroupError,
} from './errors';

export const emptyContractError = new ContractError('unexpected empty contract code of given jetton.', 100);

export const operationFetchError = (msg: string, inner?: unknown) =>
    new FetchError(`failed to fetch OperationId: ${msg}`, 101, inner);

export const statusFetchError = (msg: string, inner?: unknown) =>
    new FetchError(`failed to fetch status transaction: ${msg}`, 102, inner);

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
    new EVMCallError(
        `Invalid Solidity method name: "${methodName}". Method must be either a valid identifier or have parameters (bytes,bytes).`,
        111,
    );

export const simulationError = (inner: unknown) => new FetchError(`Failed to simulate EVM call: ${inner}`, 112, inner);

export const profilingFetchError = (msg: string, inner?: unknown) =>
    new FetchError(`failed to fetch stage profiling: ${msg}`, 113, inner);

export const emptyArrayError = (msg: string) => new FetchError(`empty array: ${msg}`, 114);

export const invalidAssetType = new FormatError('Invalid asset type', 115);

export const prepareMessageGroupError = (isBocSizeValid: boolean, isDepthValid: boolean) =>
    new PrepareMessageGroupError(
        `Failed to prepare message group: BOC size valid: ${isBocSizeValid}, depth valid: ${isDepthValid}`,
        116,
    );

export const noValidGroupFoundError = new NoValidGroupFoundError('Failed to prepare valid message group', 117);

export const allEndpointsFailedError = (inner: unknown) => new FetchError('All endpoints failed', 118, inner);
export const allContractOpenerFailedError = (inner: unknown) =>
    new FetchError('All contract opener failed', 119, inner);
