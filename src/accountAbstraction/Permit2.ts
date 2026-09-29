// Permit2 helpers — build TAC's `PermitBatchTransferFrom` struct, compute its hash,
// and pack it into paymasterData.
//
// TAC's PermitBatchTransferFrom is a tuple matching ISignatureTransfer, with two extra
// TAC fields (chainId, verifyingContract=TacPermit2):
//   tuple(tuple(address token,uint256 amount)[], uint256 nonce, uint256 deadline, uint256 chainId, address verifyingContract)
//
// permitHash = keccak256(abi.encode(permit)) — the same value `keccak256(message)` equals
// when TacPermit2 calls account.isValidSignature(message, signature).

import { AbiCoder, BigNumberish, concat, keccak256 } from 'ethers';

const abiCoder = AbiCoder.defaultAbiCoder();

export interface Permit2TokenPermission {
    token: string;
    amount: BigNumberish;
}

export interface PermitBatchTransferFromInput {
    permitted: Permit2TokenPermission[];
    /** Unique per-permit nonce (Permit2 replay protection). */
    nonce: BigNumberish;
    /** Deadline in unix seconds. Use `ethers.MaxUint256` for no expiry. */
    deadline: BigNumberish;
    /** Chain id this permit is bound to. */
    chainId: BigNumberish;
    /** Address of the deployed `TacPermit2` (the verifyingContract). */
    verifyingContract: string;
}

/** Internal packed representation matching the contract's tuple layout. */
export type PermitBatchTransferFromTuple = [
    Array<[string, BigNumberish]>, // permitted
    BigNumberish, // nonce
    BigNumberish, // deadline
    BigNumberish, // chainId
    string, // verifyingContract
];

const PERMIT_TUPLE_TYPE = 'tuple(tuple(address,uint256)[],uint256,uint256,uint256,address)';

/** Build the TAC `PermitBatchTransferFrom` tuple, its abi-encoded message, and hash. */
export function buildPermitMessage(input: PermitBatchTransferFromInput): {
    permit: PermitBatchTransferFromTuple;
    messageHex: string;
    permitHash: string;
} {
    const permit: PermitBatchTransferFromTuple = [
        input.permitted.map((p) => [p.token, p.amount] as [string, BigNumberish]),
        input.nonce,
        input.deadline,
        input.chainId,
        input.verifyingContract,
    ];
    const messageHex = abiCoder.encode([PERMIT_TUPLE_TYPE], [permit]);
    const permitHash = keccak256(messageHex);
    return { permit, messageHex, permitHash };
}

/**
 * Wrap a permit tuple + signature blob into the `(permit, signature)` abi-encoded payload
 * that `TacERC20Paymaster._parsePermitData` consumes.
 */
export function packPermitData(permit: PermitBatchTransferFromTuple, signatureBlob: string): string {
    return abiCoder.encode([PERMIT_TUPLE_TYPE, 'bytes'], [permit, signatureBlob]);
}

/** Convenience: full `paymasterData` for Mode 1 = `0x01 ‖ abi.encode(permit, signatureBlob)`. */
export function packPermitPaymasterData(permit: PermitBatchTransferFromTuple, signatureBlob: string): string {
    return concat(['0x01', packPermitData(permit, signatureBlob)]);
}
