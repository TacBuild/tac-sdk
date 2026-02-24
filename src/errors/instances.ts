import { Origin } from '../structs/Struct';
import {
    AddressError,
    BitError,
    ContractError,
    EVMCallError,
    FetchError,
    FormatError,
    InsufficientBalanceError,
    KeyError,
    MetadataError,
    NoValidGroupFoundError,
    PrepareMessageGroupError,
    SettingError,
    TokenError,
    TransactionError,
    WalletError,
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

export const profilingFetchError = (msg: string, inner?: unknown) =>
    new FetchError(`failed to fetch stage profiling: ${msg}`, 112, inner);

export const emptyArrayError = (msg: string) => new FetchError(`empty array: ${msg}`, 113);

export const invalidAssetType = new FormatError('Invalid asset type', 114);

export const prepareMessageGroupError = (isBocSizeValid: boolean, isDepthValid: boolean) =>
    new PrepareMessageGroupError(
        `Failed to prepare message group: BOC size valid: ${isBocSizeValid}, depth valid: ${isDepthValid}`,
        115,
    );

export const noValidGroupFoundError = new NoValidGroupFoundError('Failed to prepare valid message group', 116);

function extractEndpoint(message: string): string | undefined {
    const match = message.match(/https?:\/\/\S+/i);
    if (!match) {
        return undefined;
    }
    return match[0].replace(/[),.;]+$/, '');
}

function extractResponseMessage(data: unknown, includeFullTrace: boolean): string | undefined {
    if (typeof data === 'string' && data.length > 0) {
        const isHtml = data.includes('<!doctype html>') || data.includes('<html');
        if (isHtml && !includeFullTrace) {
            return '[HTML response]';
        }
        return data;
    }
    if (!data || typeof data !== 'object') {
        return undefined;
    }

    const payload = data as Record<string, unknown>;
    if (typeof payload.message === 'string' && payload.message.length > 0) {
        return payload.message;
    }
    if (typeof payload.error === 'string' && payload.error.length > 0) {
        return payload.error;
    }

    return undefined;
}

function buildInnerErrorSummary(inner: unknown, includeFullTrace: boolean): string {
    if (inner && typeof inner === 'object') {
        const err = inner as {
            message?: unknown;
            innerMessage?: unknown;
            status?: unknown;
            httpStatus?: unknown;
            response?: {
                status?: unknown;
                data?: unknown;
            };
        };
        const parts: string[] = [];
        const responseMessage = extractResponseMessage(err.response?.data, includeFullTrace);
        const httpStatus = [err.httpStatus, err.status, err.response?.status].find((value) => typeof value === 'number');
        const httpMessage =
            typeof err.innerMessage === 'string' && err.innerMessage.length > 0 ? err.innerMessage : responseMessage;

        if (typeof httpStatus === 'number') {
            parts.push(`httpStatus=${httpStatus}`);
        }
        if (typeof httpMessage === 'string' && httpMessage.length > 0) {
            parts.push(`httpMessage=${httpMessage}`);
        }
        if (typeof err.message === 'string' && err.message.length > 0) {
            const endpoint = extractEndpoint(err.message);
            if (endpoint) {
                parts.push(`endpoint=${endpoint}`);
            }
        }
        if (parts.length > 0) {
            return parts.join(', ');
        }
    }

    if (typeof inner === 'string' && inner.length > 0) {
        return `message=${inner}`;
    }

    return 'message=unknown error';
}

export const allEndpointsFailedError = (inner: unknown, includeInnerStack = false) =>
    new FetchError(`All endpoints failed, last err: ${buildInnerErrorSummary(inner, includeInnerStack)}`, 117, inner, {
        includeInnerStack,
    });

export const allContractOpenerFailedError = (inner: unknown) =>
    new FetchError('All contract opener failed', 118, inner);

export const insufficientBalanceError = (token: string) =>
    new InsufficientBalanceError(`Insufficient balance of ${token}`, 119);

export const unknownTokenTypeError = (token: string, reason?: string) =>
    new TokenError(`Unknown token type of ${token}: ${reason}`, 120);

export const indexRequiredError = (token: string) => new TokenError(`Index is required for collection ${token}`, 121);

export const convertCurrencyFetchError = (msg: string, inner?: unknown) =>
    new FetchError(`failed to fetch convert currency: ${msg}`, 122, inner);

export const simulationFetchError = (msg: string, inner?: unknown) =>
    new FetchError(`failed to fetch simulate tac msg: ${msg}`, 123, inner);

export const getTONFeeInfoFetchError = (msg: string, inner?: unknown) =>
    new FetchError(`failed to fetch simulate tac msg: ${msg}`, 124, inner);

export const missingFeeParamsError = new FormatError(
    'When withoutSimulation is true, protocolFee and evmExecutorFee must be provided in options',
    125,
);

export const missingTvmExecutorFeeError = new FormatError(
    'When withoutSimulation is true and isRoundTrip is true, tvmExecutorFee must be provided in options',
    126,
);

export const missingGasLimitError = new FormatError(
    'When withoutSimulation is true, gasLimit must be provided in evmProxyMsg',
    127,
);

export const missingDecimals = new MetadataError('Missing decimals in jetton metadata', 128);

export const missingJettonDataError = new MetadataError('Jetton data should be available for TON origin', 129);

export const zeroRawAmountError = (assetAddress: string) =>
    new TokenError(`FT asset with zero rawAmount/amount is not allowed: ${assetAddress}`, 130);

export const sendCrossChainTransactionFailedError = (msg: string) =>
    new WalletError(`failed to send cross chain transaction: ${msg}`, 131);

export const convertCurrencyNegativeOrZeroValueError = new FormatError(
    'Value cannot be negative or zero for currency conversion',
    132,
);

export const unknownAssetOriginError = (origin: Origin) => new TokenError(`Unknown asset origin: ${origin}`, 133);

export const gasPriceFetchError = (msg: string, inner?: unknown) =>
    new FetchError(`Failed to fetch gas price: ${msg}`, 134, inner);

export const txFinalizationError = (msg: string) => new TransactionError(`Transaction failed: ${msg}`, 135);

export const insufficientFeeParamsError = (feeName: string, provided: bigint, required: bigint) =>
    new FormatError(
        `Provided ${feeName} (${provided}) is lower than required (${required}). Set shouldValidateFees: false to bypass.`,
        136,
    );
