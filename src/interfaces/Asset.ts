import type { Cell } from '@ton/ton';

import { AssetType, FeeParams } from '../structs/Struct';

export interface Asset {
    // Address of the token on the blockchain
    address: string;
    // Type of the token
    type: AssetType;
    // Raw amount of the token to be transferred
    rawAmount: bigint;
    // Clone to create new token with the same parameters
    clone: Asset;
    /**
     * Returns a new asset instance with the specified transfer amount.
     * Use { rawAmount } for base units (e.g., nano units), or { amount } for human-readable units if supported by the implementation.
     * Does not mutate the current asset instance.
     * @param amount Object specifying either rawAmount (bigint base units) or amount (number in human units).
     * @returns Promise that resolves to a new Asset reflecting the requested amount.
     */
    withAmount(amount: { rawAmount: bigint } | { amount: number }): Promise<Asset>;
    /**
     * Increases the transfer amount by the specified value and returns a new asset instance.
     * Does not mutate the current asset instance.
     * @param amount Object specifying either rawAmount (bigint base units) or amount (number in human units).
     * @returns Promise that resolves to a new Asset with the increased amount.
     */
    addAmount(amount: { rawAmount: bigint } | { amount: number }): Promise<Asset>;
    /**
     * Resolves the corresponding EVM token address for this asset.
     * Useful when bridging or interacting with EVM-compatible networks.
     * @returns Promise that resolves to the EVM address as a checksum string.
     */
    getEVMAddress(): Promise<string>;
    /**
     * Returns the TVM (TON Virtual Machine) address for this asset.
     * @returns Promise that resolves to the TVM address as a friendly or raw string depending on implementation.
     */
    getTVMAddress(): Promise<string>;
    /**
     * Generates a TVM payload for transferring or interacting with this asset across chains.
     * Implementations may include cross-chain metadata, fees, and forwarding info.
     * @param params Parameters that describe the payload composition.
     * @param params.excessReceiver Address that will receive the excess TON after execution.
     * @param params.evmData Serialized EVM-side call data to be forwarded via the bridge.
     * @param params.crossChainTonAmount Optional TON amount to transfer cross-chain with the message.
     * @param params.forwardFeeTonAmount Optional TON amount used to cover forwarding fees on TON.
     * @param params.feeParams Optional fee parameters to fine-tune execution costs.
     * @returns Promise that resolves to a Cell containing the encoded payload.
     */
    generatePayload(params: {
        excessReceiver: string;
        evmData: Cell;
        crossChainTonAmount?: bigint;
        forwardFeeTonAmount?: bigint;
        feeParams?: FeeParams;
    }): Promise<Cell>;
    /**
     * Validates whether the specified user is allowed to transfer this asset.
     * Implementations should throw if the transfer is not permitted (e.g., frozen asset, missing wallet, insufficient permissions).
     * @param userAddress TVM address of the user attempting to transfer the asset.
     * @returns Promise that resolves if transfer is allowed; rejects with an error otherwise.
     */
    checkCanBeTransferredBy(userAddress: string): Promise<void>;
    /**
     * Retrieves the current balance of this asset for the given user address.
     * @param userAddress TVM address of the user.
     * @returns Promise that resolves to the balance in raw base units (bigint).
     */
    getBalanceOf(userAddress: string): Promise<bigint>;
}
