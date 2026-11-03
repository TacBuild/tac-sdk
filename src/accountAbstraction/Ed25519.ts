// Ed25519 signature packers for TAC accounts. The on-chain account
// (TacBaseAccount._validateUserOp) accepts THREE signature formats discriminated by length:
//
//   1. 64 bytes — abi.encode(bytes32[2]) = r||s. Verified directly over userOpHash.
//   2. 96 bytes — r ++ s ++ permitHash. Verified over `userOpHash || permitHash`.
//      One Ed25519 signature authorises both the UserOp and a Permit2 transfer.
//   3. else — abi.encode(r, s, ts, domain, wc, addrHash, permitHash) (TonConnect envelope).

import { AbiCoder, BytesLike, concat, hexlify, zeroPadValue } from 'ethers';

const abiCoder = AbiCoder.defaultAbiCoder();

/** Raw Ed25519 signature components; both `r` and `s` are 32-byte 0x-hex strings. */
export interface Ed25519Signature {
    r: string;
    s: string;
}

/** Async callback producing an Ed25519 signature over a 32-byte message (0x-hex). */
export type Ed25519Signer = (message: string) => Promise<Ed25519Signature>;

/** Pack an Ed25519 signature into the 64-byte format (abi.encode(bytes32[2])). */
export function packRawEd25519Signature(sig: Ed25519Signature): string {
    return abiCoder.encode(['bytes32[2]'], [[zeroPadValue(hexlify(sig.r), 32), zeroPadValue(hexlify(sig.s), 32)]]);
}

/** Pack a Permit2-bound userOp signature: `r ‖ s ‖ permitHash` (96 bytes). */
export function packPermitBoundUserOpSignature(sig: Ed25519Signature, permitHash: BytesLike): string {
    return concat([zeroPadValue(hexlify(sig.r), 32), zeroPadValue(hexlify(sig.s), 32), zeroPadValue(hexlify(permitHash), 32)]);
}

/** Pack a Permit2 inner signature (inside paymasterData): `r ‖ s ‖ userOpHash` (96 bytes). */
export function packPermit2InnerSignature(sig: Ed25519Signature, userOpHash: BytesLike): string {
    return concat([zeroPadValue(hexlify(sig.r), 32), zeroPadValue(hexlify(sig.s), 32), zeroPadValue(hexlify(userOpHash), 32)]);
}

/** Build the 64-byte binding `userOpHash ‖ permitHash` for the signer to sign. */
export function buildPermitBinding(userOpHash: BytesLike, permitHash: BytesLike): string {
    return concat([zeroPadValue(hexlify(userOpHash), 32), zeroPadValue(hexlify(permitHash), 32)]);
}

// ---------------------------------------------------------------------------
// TonConnect-wrapped format
// ---------------------------------------------------------------------------

/** Components a TonConnect wallet returns when it signs a binary payload. */
export interface TonConnectSignedParts {
    r: string;
    s: string;
    timestamp: number;
    domain: string;
    workchain: number;
    addrHash: string;
}

/** Async signer that drives a TonConnect wallet; receives the 64-byte binding. */
export type TonConnectSigner = (binding: string) => Promise<TonConnectSignedParts>;

const ZERO_HASH = '0x' + '00'.repeat(32);

/**
 * Pack `userOp.signature` for the TonConnect-wrapped variant:
 *   abi.encode(r, s, timestamp, domain, workchain, addrHash, permitHash)
 */
export function packTonConnectUserOpSignature(parts: TonConnectSignedParts, permitHash: BytesLike = ZERO_HASH): string {
    return abiCoder.encode(
        ['bytes32', 'bytes32', 'uint64', 'string', 'int32', 'bytes32', 'bytes32'],
        [
            zeroPadValue(hexlify(parts.r), 32),
            zeroPadValue(hexlify(parts.s), 32),
            parts.timestamp,
            parts.domain,
            parts.workchain,
            zeroPadValue(hexlify(parts.addrHash), 32),
            zeroPadValue(hexlify(permitHash), 32),
        ],
    );
}

/**
 * Pack the Permit2 inner signature for the TonConnect-wrapped variant:
 *   abi.encode(r, s, timestamp, domain, workchain, addrHash, userOpHash)
 */
export function packTonConnectPermit2InnerSignature(parts: TonConnectSignedParts, userOpHash: BytesLike): string {
    return abiCoder.encode(
        ['bytes32', 'bytes32', 'uint64', 'string', 'int32', 'bytes32', 'bytes32'],
        [
            zeroPadValue(hexlify(parts.r), 32),
            zeroPadValue(hexlify(parts.s), 32),
            parts.timestamp,
            parts.domain,
            parts.workchain,
            zeroPadValue(hexlify(parts.addrHash), 32),
            zeroPadValue(hexlify(userOpHash), 32),
        ],
    );
}

/**
 * Build an {@link Ed25519Signer} from a raw 64-byte secret key + an Ed25519 impl.
 * The SDK bundles no Ed25519 library; pass e.g. `@ton/crypto`'s `sign`:
 *
 * ```ts
 * import { sign } from '@ton/crypto';
 * const signer = ed25519SignerFromSecretKey(secretKey, (m, sk) => sign(Buffer.from(m), Buffer.from(sk)));
 * ```
 */
export function ed25519SignerFromSecretKey(
    secretKey: Uint8Array,
    ed25519Sign: (message: Uint8Array, secretKey: Uint8Array) => Uint8Array,
): Ed25519Signer {
    return async (message: string) => {
        const msgBytes = hexToBytes(message);
        const sig = ed25519Sign(msgBytes, secretKey);
        if (sig.length !== 64) {
            throw new Error(`expected 64-byte Ed25519 signature, got ${sig.length}`);
        }
        return {
            r: '0x' + bytesToHex(sig.slice(0, 32)),
            s: '0x' + bytesToHex(sig.slice(32, 64)),
        };
    };
}

function hexToBytes(hex: string): Uint8Array {
    const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    return out;
}

function bytesToHex(bytes: Uint8Array): string {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
    return s;
}
