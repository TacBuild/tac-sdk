import { Wallet } from 'ethers';

import { Asset } from './Asset';

export interface ITACTransactionManager {
    /**
     * Bridges native EVM value and optional assets to TON chain via executor.
     * @param signer Ethers Wallet used to sign EVM transaction.
     * @param value Amount of native EVM currency (wei as bigint).
     * @param tonTarget Recipient TVM address on TON.
     * @param assets Optional list of TAC assets to include.
     * @param tvmExecutorFee Optional explicit TON-side executor fee.
     * @param tvmValidExecutors Optional whitelist of allowed TVM executors.
     * @returns EVM transaction hash or bridge identifier.
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
