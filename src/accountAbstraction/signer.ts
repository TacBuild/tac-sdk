import { mnemonicToWalletKey, sign } from 'ton-crypto';

import { Ed25519Signer,ed25519SignerFromSecretKey } from './Ed25519';

export interface AaSignerResult {
    /** Ed25519 public key as 32-byte 0x-hex — the AA account is derived from this. */
    publicKey: string;
    /** Signer that produces `(r, s)` over a 32-byte message. */
    signer: Ed25519Signer;
}

/**
 * Build an AA signer + public key from a TON mnemonic, using the same key derivation as
 * `SenderFactory` (`mnemonicToWalletKey`, which equals `mnemonicToPrivateKey`).
 */
export async function aaSignerFromMnemonic(mnemonic: string): Promise<AaSignerResult> {
    const keypair = await mnemonicToWalletKey(mnemonic.trim().split(/\s+/));
    const signer = ed25519SignerFromSecretKey(keypair.secretKey, (message, secretKey) =>
        sign(Buffer.from(message), Buffer.from(secretKey)),
    );
    return { publicKey: '0x' + keypair.publicKey.toString('hex'), signer };
}
