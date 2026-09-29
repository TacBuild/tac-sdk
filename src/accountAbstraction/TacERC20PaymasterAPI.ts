import { BigNumberish, BytesLike, concat, toBeHex, zeroPadValue } from 'ethers';

import { PaymasterAPI, PaymasterParams } from './PaymasterAPI';

/**
 * Mode discriminator consumed by `TacERC20Paymaster._parsePaymasterAndData`. The mode byte
 * sits at index 52 of the full `paymasterAndData` (after `paymaster(20) ‖ pmVerifGas(16) ‖
 * pmPostOpGas(16)`); everything after it is mode-specific.
 */
export enum TacPaymasterMode {
    /**
     * Paymaster pulls the token from the account via `transferFrom` during validation.
     * The account MUST have pre-approved the paymaster on the token. `paymasterData = 0x00`.
     */
    TRANSFER_FROM_REQUESTOR = 0,

    /**
     * Paymaster receives a Permit2 `PermitBatchTransferFrom` + signature inside
     * `paymasterData`. Requires the two-round double-sign — use
     * {@link buildSignedUserOpWithPermit}, not this API directly.
     * `paymasterData = 0x01 ‖ abi.encode(PermitBatchTransferFrom, signatureBlob)`.
     */
    TRANSFER_VIA_PERMIT = 1,

    /**
     * Paymaster debits the account's pre-funded `internalBalance` (credited off-band by
     * the paymaster owner). No approval, no token transfer. `paymasterData = 0x02`.
     */
    INTERNAL_BALANCE = 2,
}

export interface TacERC20PaymasterApiParams {
    paymaster: string;
    mode: TacPaymasterMode;
    paymasterVerificationGasLimit?: BigNumberish;
    paymasterPostOpGasLimit?: BigNumberish;
}

const DEFAULT_PM_VERIFICATION_GAS_LIMIT: BigNumberish = 100000;
const DEFAULT_PM_POST_OP_GAS_LIMIT: BigNumberish = 100000;

/**
 * PaymasterAPI for TAC's `TacERC20Paymaster`. One instance per mode.
 * Modes 0 (TRANSFER_FROM_REQUESTOR) and 2 (INTERNAL_BALANCE) compose directly into a
 * `TacAccountAPI` via its `paymasterAPI`; Mode 1 needs {@link buildSignedUserOpWithPermit}.
 */
export class TacERC20PaymasterAPI extends PaymasterAPI {
    paymaster: string;
    mode: TacPaymasterMode;
    paymasterVerificationGasLimit: BigNumberish;
    paymasterPostOpGasLimit: BigNumberish;

    constructor(params: TacERC20PaymasterApiParams) {
        super();
        this.paymaster = params.paymaster;
        this.mode = params.mode;
        this.paymasterVerificationGasLimit = params.paymasterVerificationGasLimit ?? DEFAULT_PM_VERIFICATION_GAS_LIMIT;
        this.paymasterPostOpGasLimit = params.paymasterPostOpGasLimit ?? DEFAULT_PM_POST_OP_GAS_LIMIT;
    }

    async getTemporaryPaymasterData(): Promise<PaymasterParams | null> {
        return await this.getPaymasterData();
    }

    async getPaymasterData(): Promise<PaymasterParams | null> {
        return {
            paymaster: this.paymaster,
            paymasterVerificationGasLimit: this.paymasterVerificationGasLimit,
            paymasterPostOpGasLimit: this.paymasterPostOpGasLimit,
            paymasterData: this._buildPaymasterData(),
        };
    }

    private _buildPaymasterData(): BytesLike {
        switch (this.mode) {
            case TacPaymasterMode.TRANSFER_FROM_REQUESTOR:
            case TacPaymasterMode.INTERNAL_BALANCE:
                return packModeByte(this.mode);
            case TacPaymasterMode.TRANSFER_VIA_PERMIT:
                throw new Error(
                    'TacPaymasterMode.TRANSFER_VIA_PERMIT requires the double-signing flow. ' +
                        'Use buildSignedUserOpWithPermit(...) instead of composing this PaymasterAPI into a TacAccountAPI.',
                );
            default:
                throw new Error(`unknown TacPaymasterMode: ${this.mode as number}`);
        }
    }
}

/** Pack a single-byte mode discriminator: `0x00`, `0x01`, or `0x02`. */
export function packModeByte(mode: TacPaymasterMode): string {
    return zeroPadValue(toBeHex(mode), 1);
}

/**
 * Assemble the full on-chain `paymasterAndData` field
 * (`paymaster ‖ pmVerifGasLimit ‖ pmPostOpGasLimit ‖ modeByte ‖ extra`).
 */
export function packPaymasterAndData(params: {
    paymaster: string;
    paymasterVerificationGasLimit: BigNumberish;
    paymasterPostOpGasLimit: BigNumberish;
    paymasterData: BytesLike;
}): string {
    return concat([
        params.paymaster,
        zeroPadValue(toBeHex(params.paymasterVerificationGasLimit), 16),
        zeroPadValue(toBeHex(params.paymasterPostOpGasLimit), 16),
        params.paymasterData,
    ]);
}
