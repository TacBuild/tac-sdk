// Self-contained ERC-4337 v0.8 UserOperation types + packing helpers, ported to
// ethers v6. Vendored from @account-abstraction/utils (which is ethers v5 and
// unpublished) so the accountAbstraction module has no external AA dependency.

import { BigNumberish, BytesLike, concat, hexlify, toBeHex, toBigInt, toQuantity, zeroPadValue } from 'ethers';

/** Unpacked UserOperation as the SDK/bundler exchange it (paymaster fields split out). */
export interface UserOperation {
    sender: string;
    nonce: BigNumberish;

    factory?: string;
    factoryData?: BytesLike;

    callData: BytesLike;
    callGasLimit: BigNumberish;
    verificationGasLimit: BigNumberish;
    preVerificationGas: BigNumberish;

    maxFeePerGas: BigNumberish;
    maxPriorityFeePerGas: BigNumberish;

    paymaster?: string;
    paymasterData?: BytesLike;
    paymasterVerificationGasLimit?: BigNumberish;
    paymasterPostOpGasLimit?: BigNumberish;

    signature: BytesLike;
    authorizationList?: unknown[];
}

/** The on-chain PackedUserOperation tuple shape (what EntryPoint.getUserOpHash consumes). */
export interface PackedUserOperation {
    sender: string;
    nonce: string;
    initCode: string;
    callData: string;
    accountGasLimits: string;
    preVerificationGas: string;
    gasFees: string;
    paymasterAndData: string;
    signature: string;
}

/** initCode split, as returned by an account API for an undeployed account. */
export interface FactoryParams {
    factory: string;
    factoryData?: BytesLike;
}

/**
 * Coerce a bytes-like field to a hex string, treating '' / null / undefined as '0x'.
 * `createUnsignedUserOp` returns an unsigned op with `signature: ''`, and ethers'
 * `hexlify('')` throws — so a plain `?? '0x'` (only catches null/undefined) is not enough.
 */
export function toHexBytes(v: BytesLike | null | undefined): string {
    return v == null || v === '' ? '0x' : hexlify(v);
}

/** Pack two 128-bit values into a single bytes32 (high128 << 128 | low128). */
export function packUint(high128: BigNumberish, low128: BigNumberish): string {
    return zeroPadValue(toBeHex((toBigInt(high128) << 128n) + toBigInt(low128)), 32);
}

/** Pack the paymaster fields into the on-chain `paymasterAndData` bytes. */
export function packPaymasterData(
    paymaster: string,
    paymasterVerificationGasLimit: BigNumberish,
    postOpGasLimit: BigNumberish,
    paymasterData?: BytesLike,
): string {
    return concat([paymaster, packUint(paymasterVerificationGasLimit, postOpGasLimit), toHexBytes(paymasterData)]);
}

/** Pack an unpacked UserOperation into the on-chain PackedUserOperation tuple. */
export function packUserOp(op: UserOperation): PackedUserOperation {
    let paymasterAndData = '0x';
    if (op.paymaster != null) {
        if (op.paymasterVerificationGasLimit == null || op.paymasterPostOpGasLimit == null) {
            throw new Error('paymaster with no gas limits');
        }
        paymasterAndData = packPaymasterData(
            op.paymaster,
            op.paymasterVerificationGasLimit,
            op.paymasterPostOpGasLimit,
            op.paymasterData,
        );
    }
    const initCode = op.factory == null ? '0x' : concat([op.factory, toHexBytes(op.factoryData)]);
    return {
        sender: op.sender,
        nonce: toBeHex(toBigInt(op.nonce)),
        initCode,
        callData: toHexBytes(op.callData),
        accountGasLimits: packUint(op.verificationGasLimit, op.callGasLimit),
        preVerificationGas: toBeHex(toBigInt(op.preVerificationGas)),
        gasFees: packUint(op.maxPriorityFeePerGas, op.maxFeePerGas),
        paymasterAndData,
        signature: toHexBytes(op.signature),
    };
}

/**
 * Recursively hex-encode a value for JSON-RPC: numeric values become minimal hex
 * quantities, byte arrays become hex strings, everything else is passed through.
 */
export function deepHexlify(obj: unknown): unknown {
    if (typeof obj === 'function') {
        return undefined;
    }
    if (obj == null || typeof obj === 'string' || typeof obj === 'boolean') {
        return obj;
    }
    if (typeof obj === 'bigint' || typeof obj === 'number') {
        return toQuantity(obj);
    }
    if (obj instanceof Uint8Array) {
        return hexlify(obj);
    }
    if (Array.isArray(obj)) {
        return obj.map((member) => deepHexlify(member));
    }
    const record = obj as Record<string, unknown>;
    return Object.keys(record).reduce<Record<string, unknown>>((set, key) => ({ ...set, [key]: deepHexlify(record[key]) }), {});
}
