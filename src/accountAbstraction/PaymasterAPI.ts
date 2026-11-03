import { BigNumberish, BytesLike } from 'ethers';

/**
 * Returned paymaster parameters. If a paymaster is specified, the gas limits must be
 * specified too (even if postOp is not called, paymasterPostOpGasLimit must be set).
 */
export interface PaymasterParams {
    paymaster: string;
    paymasterData?: BytesLike;
    paymasterVerificationGasLimit: BigNumberish;
    paymasterPostOpGasLimit: BigNumberish;
}

/**
 * An API to fill a UserOperation with paymaster info. Subclass and override to implement a
 * specific paymaster (see {@link TacERC20PaymasterAPI}).
 */
export class PaymasterAPI {
    /** Temporary values to put into the paymaster fields (used for gas estimation). */
    async getTemporaryPaymasterData(): Promise<PaymasterParams | null> {
        return await this.getPaymasterData();
    }

    /** Final paymaster parameters (after gas estimation). */
    async getPaymasterData(): Promise<PaymasterParams | null> {
        return null;
    }
}
