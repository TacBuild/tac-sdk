// Higher-level helper for paymaster Mode 1 — TRANSFER_VIA_PERMIT.
//
// This mode needs a *double-signing* dance: both userOp.signature AND the inner signature
// inside paymasterData depend on userOpHash, which itself depends on paymasterAndData (which
// contains the inner signature). The flow:
//
//   1. Compute permit + permitHash.
//   2. Build paymasterData with a placeholder inner sig (96 zero bytes).
//   3. userOpHash_r1 = getUserOpHash(op with placeholder).
//   4. sign Ed25519 over `userOpHash_r1 || permitHash`  -> (r1, s1).
//   5. paymasterData.innerSig = r1 ‖ s1 ‖ userOpHash_r1.
//   6. userOpHash_r2 = getUserOpHash(final op).
//   7. sign Ed25519 over `userOpHash_r2 || permitHash`  -> (r2, s2).
//   8. userOp.signature = r2 ‖ s2 ‖ permitHash.

import { BigNumberish, concat, Contract } from 'ethers';

import {
    buildPermitBinding,
    Ed25519Signer,
    packPermit2InnerSignature,
    packPermitBoundUserOpSignature,
    packTonConnectPermit2InnerSignature,
    packTonConnectUserOpSignature,
    TonConnectSigner,
} from './Ed25519';
import { IEntryPointABI } from './internal/entryPointAbi';
import { packUserOp, UserOperation } from './internal/userOp';
import { buildPermitMessage, packPermitData, PermitBatchTransferFromInput } from './Permit2';
import { TacAccountAPI } from './TacAccountAPI';
import { packModeByte, TacPaymasterMode } from './TacERC20PaymasterAPI';
import { TransactionDetailsForUserOp } from './TransactionDetailsForUserOp';

const DEFAULT_PM_GAS: BigNumberish = 100000;
const PLACEHOLDER_INNER_SIG = '0x' + '00'.repeat(96);

/**
 * Inputs to {@link buildSignedUserOpWithPermit}.
 *
 * @param accountAPI  the TacAccountAPI driving sender/factory/callData/nonce. Should NOT have
 *                    a paymasterAPI configured — this helper owns paymasterData.
 * @param paymaster   TacERC20Paymaster contract address.
 * @param permitInput the permit struct to authorise (permitted[].amount caps the gas budget).
 * @param ed25519Signer invoked twice (once per round) with a 64-byte binding.
 * @param txDetails   execution target/value/data for the UserOp.
 */
export interface BuildPermitUserOpInput {
    accountAPI: TacAccountAPI;
    paymaster: string;
    paymasterVerificationGasLimit?: BigNumberish;
    paymasterPostOpGasLimit?: BigNumberish;
    permitInput: PermitBatchTransferFromInput;
    ed25519Signer: Ed25519Signer;
    txDetails: TransactionDetailsForUserOp;
}

/** TonConnect-wallet variant inputs. */
export interface BuildPermitUserOpInputTonConnect {
    accountAPI: TacAccountAPI;
    paymaster: string;
    paymasterVerificationGasLimit?: BigNumberish;
    paymasterPostOpGasLimit?: BigNumberish;
    permitInput: PermitBatchTransferFromInput;
    tonConnectSigner: TonConnectSigner;
    txDetails: TransactionDetailsForUserOp;
}

/**
 * Build a fully-signed UserOp paying gas via TacERC20Paymaster's TRANSFER_VIA_PERMIT mode.
 * Performs the two-round double-sign; the EntryPoint (for userOpHash) is derived from the
 * accountAPI's entryPointAddress + provider.
 */
export async function buildSignedUserOpWithPermit(input: BuildPermitUserOpInput): Promise<UserOperation> {
    const { accountAPI, paymaster, permitInput, ed25519Signer, txDetails } = input;
    const pmVerifGas = input.paymasterVerificationGasLimit ?? DEFAULT_PM_GAS;
    const pmPostOpGas = input.paymasterPostOpGasLimit ?? DEFAULT_PM_GAS;

    const entryPoint = new Contract(accountAPI.entryPointAddress, IEntryPointABI, accountAPI.provider);
    const { permit, permitHash } = buildPermitMessage(permitInput);

    // Round 1 — placeholder inner signature.
    const userOp = await accountAPI.createUnsignedUserOp(txDetails);
    userOp.paymaster = paymaster;
    userOp.paymasterVerificationGasLimit = pmVerifGas;
    userOp.paymasterPostOpGasLimit = pmPostOpGas;
    userOp.paymasterData = concat([
        packModeByte(TacPaymasterMode.TRANSFER_VIA_PERMIT),
        packPermitData(permit, PLACEHOLDER_INNER_SIG),
    ]);

    const userOpHashR1: string = await entryPoint.getUserOpHash.staticCall(packUserOp(userOp));
    const sigR1 = await ed25519Signer(buildPermitBinding(userOpHashR1, permitHash));

    // Round 2 — final inner signature bound to userOpHash_r1.
    const innerSig = packPermit2InnerSignature(sigR1, userOpHashR1);
    userOp.paymasterData = concat([packModeByte(TacPaymasterMode.TRANSFER_VIA_PERMIT), packPermitData(permit, innerSig)]);

    const userOpHashR2: string = await entryPoint.getUserOpHash.staticCall(packUserOp(userOp));
    const sigR2 = await ed25519Signer(buildPermitBinding(userOpHashR2, permitHash));

    userOp.signature = packPermitBoundUserOpSignature(sigR2, permitHash);
    return userOp;
}

/** TonConnect-wallet variant of {@link buildSignedUserOpWithPermit}. */
export async function buildSignedUserOpWithPermitTonConnect(input: BuildPermitUserOpInputTonConnect): Promise<UserOperation> {
    const { accountAPI, paymaster, permitInput, tonConnectSigner, txDetails } = input;
    const pmVerifGas = input.paymasterVerificationGasLimit ?? DEFAULT_PM_GAS;
    const pmPostOpGas = input.paymasterPostOpGasLimit ?? DEFAULT_PM_GAS;

    const entryPoint = new Contract(accountAPI.entryPointAddress, IEntryPointABI, accountAPI.provider);
    const { permit, permitHash } = buildPermitMessage(permitInput);

    const userOp = await accountAPI.createUnsignedUserOp(txDetails);
    userOp.paymaster = paymaster;
    userOp.paymasterVerificationGasLimit = pmVerifGas;
    userOp.paymasterPostOpGasLimit = pmPostOpGas;
    userOp.paymasterData = concat([
        packModeByte(TacPaymasterMode.TRANSFER_VIA_PERMIT),
        packPermitData(permit, PLACEHOLDER_INNER_SIG),
    ]);

    const userOpHashR1: string = await entryPoint.getUserOpHash.staticCall(packUserOp(userOp));
    const partsR1 = await tonConnectSigner(buildPermitBinding(userOpHashR1, permitHash));

    const innerSig = packTonConnectPermit2InnerSignature(partsR1, userOpHashR1);
    userOp.paymasterData = concat([packModeByte(TacPaymasterMode.TRANSFER_VIA_PERMIT), packPermitData(permit, innerSig)]);

    const userOpHashR2: string = await entryPoint.getUserOpHash.staticCall(packUserOp(userOp));
    const partsR2 = await tonConnectSigner(buildPermitBinding(userOpHashR2, permitHash));
    userOp.signature = packTonConnectUserOpSignature(partsR2, permitHash);
    return userOp;
}
