export class ErrorWithStatusCode extends Error {
    readonly errorCode: number;

    constructor(message: string, errorCode: number) {
        super(message);
        this.errorCode = errorCode;
    }
}

export class ContractError extends ErrorWithStatusCode {
    constructor(message: string, errorCode: number) {
        super(message, errorCode);
        this.name = 'ContractError';
    }
}

export class FetchError extends ErrorWithStatusCode {
    constructor(message: string, errorCode: number) {
        super(message, errorCode);
        this.name = 'FetchError';
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
