export class ErrorWithStatusCode extends Error {
    readonly errorCode: number;

    constructor(message: string, errorCode: number) {
        super(message);
        this.errorCode = errorCode;
    }
}

type UnknownRecord = Record<string, unknown>;

function asString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return undefined;
}

function extractResponseMessage(responseData: unknown): string | undefined {
    if (typeof responseData === 'string' && responseData.length > 0) {
        return responseData;
    }

    const data = responseData as UnknownRecord | undefined;
    const nestedError = data?.error && typeof data.error === 'object' ? (data.error as UnknownRecord) : undefined;

    return (
        asString(data?.message) ??
        asString(data?.error) ??
        asString(nestedError?.message) ??
        asString(nestedError?.error)
    );
}

export class ContractError extends ErrorWithStatusCode {
    constructor(message: string, errorCode: number) {
        super(message, errorCode);
        this.name = 'ContractError';
    }
}

export class FetchError extends ErrorWithStatusCode {
    readonly inner?: unknown;
    readonly httpStatus?: number;
    readonly innerErrorCode?: number;
    readonly innerErrorName?: string;
    readonly innerMessage?: string;
    readonly innerStack?: string;

    constructor(
        message: string,
        errorCode: number,
        inner?: unknown,
        options?: {
            includeInnerStack?: boolean;
        },
    ) {
        super(message, errorCode);
        this.name = 'FetchError';
        this.inner = inner;

        if (inner && typeof inner === 'object') {
            const err = inner as {
                name?: string;
                message?: string;
                stack?: string;
                errorCode?: unknown;
                status?: unknown;
                response?: { status?: unknown; data?: unknown };
            };
            this.httpStatus = asNumber(err.status) ?? asNumber(err.response?.status);
            this.innerErrorCode = asNumber(err.errorCode);
            if (typeof err.name === 'string') {
                this.innerErrorName = err.name;
            }
            this.innerMessage = extractResponseMessage(err.response?.data) ?? asString(err.message);
            if (options?.includeInnerStack && typeof err.stack === 'string') {
                this.innerStack = err.stack;
            }
        }
    }

    toDebugString(includeTrace = false): string {
        const parts = [`${this.name} (${this.errorCode}): ${this.message}`];
        if (this.httpStatus !== undefined) {
            parts.push(`httpStatus: ${this.httpStatus}`);
        }
        if (this.innerErrorCode !== undefined) {
            parts.push(`innerErrorCode: ${this.innerErrorCode}`);
        }
        if (this.innerErrorName) {
            parts.push(`innerErrorName: ${this.innerErrorName}`);
        }
        if (this.innerMessage) {
            parts.push(`innerMessage: ${this.innerMessage}`);
        }
        if (includeTrace && this.innerStack) {
            parts.push(`innerStack:\n${this.innerStack}`);
        }
        return parts.join('\n');
    }
}

export class AddressError extends ErrorWithStatusCode {
    constructor(message: string, errorCode: number) {
        super(message, errorCode);
        this.name = 'AddressError';
    }
}

export class WalletError extends ErrorWithStatusCode {
    constructor(message: string, errorCode: number) {
        super(message, errorCode);
        this.name = 'WalletError';
    }
}

export class KeyError extends ErrorWithStatusCode {
    constructor(message: string, errorCode: number) {
        super(message, errorCode);
        this.name = 'KeyError';
    }
}

export class FormatError extends ErrorWithStatusCode {
    constructor(message: string, errorCode: number) {
        super(message, errorCode);
        this.name = 'FormatError';
    }
}

export class BitError extends ErrorWithStatusCode {
    constructor(message: string, errorCode: number) {
        super(message, errorCode);
        this.name = 'BitError';
    }
}

export class MetadataError extends ErrorWithStatusCode {
    constructor(message: string, errorCode: number) {
        super(message, errorCode);
        this.name = 'MetadataError';
    }
}

export class SettingError extends ErrorWithStatusCode {
    constructor(message: string, errorCode: number) {
        super(message, errorCode);
        this.name = 'SettingError';
    }
}

export class EVMCallError extends ErrorWithStatusCode {
    constructor(message: string, errorCode: number) {
        super(message, errorCode);
        this.name = 'EVMCallError';
    }
}

export class PrepareMessageGroupError extends ErrorWithStatusCode {
    constructor(message: string, errorCode: number) {
        super(message, errorCode);
        this.name = 'PrepareMessageGroupError';
    }
}

export class NoValidGroupFoundError extends ErrorWithStatusCode {
    constructor(message: string, errorCode: number) {
        super(message, errorCode);
        this.name = 'NoValidGroupFoundError';
    }
}

export class InsufficientBalanceError extends ErrorWithStatusCode {
    constructor(message: string, errorCode: number) {
        super(message, errorCode);
        this.name = 'InsufficientBalanceError';
    }
}

export class TokenError extends ErrorWithStatusCode {
    constructor(message: string, errorCode: number) {
        super(message, errorCode);
        this.name = 'TokenError';
    }
}

export class TransactionError extends ErrorWithStatusCode {
    constructor(message: string, errorCode: number) {
        super(message, errorCode);
        this.name = 'TransactionError';
    }
}
