import { Wallet } from 'ethers';

import { CrossChainTransactionToTONOptions, TACCrossChainTransactionResult } from '../structs/Struct';
import { Asset } from './Asset';

export interface ITACTransactionManager {
    /**
     * Sends a single TAC -> TON cross-chain transaction and optionally waits for operation tracking data.
     * Native TAC amount is bridged separately from required bridge fees. This high-level method
     * performs production-oriented TAC prechecks: requires EIP-1559 fee data from the TAC provider,
     * optionally validates balances / ownership of non-native TAC assets, uses provider gas estimates as-is,
     * validates those estimates against the latest TAC block gas limit,
     * computes the worst-case upfront TAC balance requirement, and then submits approvals plus the bridge message.
     * @param signer Ethers Wallet used to sign EVM transaction.
     * @param tonTarget Recipient TVM address on TON.
     * @param assets Optional list of TAC assets to include. Native TAC should be passed here as a TAC asset.
     * @param options Optional bridge configuration object.
     * @returns TAC transaction hash and optional operationId.
     */
    sendCrossChainTransactionToTON(
        signer: Wallet,
        tonTarget: string,
        assets?: Asset[],
        options?: CrossChainTransactionToTONOptions,
    ): Promise<TACCrossChainTransactionResult>;

    /**
     * Bridges native EVM value and optional assets to TON chain via executor.
     * This is a low-level send-only method: it approves assets, sends the TAC -> TON message and
     * returns the TAC transaction hash. It does not perform provider-backed TAC fee / gas-limit
     * prechecks or TAC balance sufficiency validation; use sendCrossChainTransactionToTON for that flow.
     * @param signer Ethers Wallet used to sign EVM transaction.
     * @param value Amount of native EVM currency (wei as bigint).
     * @param tonTarget Recipient TVM address on TON.
     * @param assets Optional list of TAC assets to include.
     * @param tvmExecutorFee Optional explicit TON-side executor fee.
     * @param tvmValidExecutors Optional whitelist of allowed TVM executors.
     * @returns EVM transaction hash.
     */
    bridgeTokensToTON(
        signer: Wallet,
        value: bigint,
        tonTarget: string,
        assets?: Asset[],
        tvmExecutorFee?: bigint,
        tvmValidExecutors?: string[],
    ): Promise<string>;
}
