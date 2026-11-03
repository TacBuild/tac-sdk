import { JsonRpcProvider, resolveProperties } from 'ethers';

import { deepHexlify, UserOperation } from './internal/userOp';

/** Thin client for an ERC-4337 bundler's JSON-RPC endpoints. */
export class HttpRpcClient {
    private readonly userOpJsonRpcProvider: JsonRpcProvider;

    initializing: Promise<void>;

    constructor(
        readonly bundlerUrl: string,
        readonly entryPointAddress: string,
        readonly chainId: number,
    ) {
        this.userOpJsonRpcProvider = new JsonRpcProvider(this.bundlerUrl);
        this.initializing = this.validateChainId();
    }

    async validateChainId(): Promise<void> {
        const chain = await this.userOpJsonRpcProvider.send('eth_chainId', []);
        const bundlerChain = parseInt(chain);
        if (bundlerChain !== this.chainId) {
            throw new Error(`bundler ${this.bundlerUrl} is on chainId ${bundlerChain}, but the client expects ${this.chainId}`);
        }
    }

    /**
     * Send a UserOperation to the bundler.
     * @returns the userOpHash (id of this operation).
     */
    async sendUserOpToBundler(userOp: UserOperation): Promise<string> {
        await this.initializing;
        const hexifiedUserOp = deepHexlify(await resolveProperties(userOp));
        return await this.userOpJsonRpcProvider.send('eth_sendUserOperation', [hexifiedUserOp, this.entryPointAddress]);
    }

    /**
     * Ask the bundler to estimate gas for a UserOperation.
     */
    async estimateUserOpGas(
        userOp: Partial<UserOperation>,
    ): Promise<{ callGasLimit: number; preVerificationGas: number; verificationGasLimit: number }> {
        await this.initializing;
        const hexifiedUserOp = deepHexlify(userOp);
        return await this.userOpJsonRpcProvider.send('eth_estimateUserOperationGas', [hexifiedUserOp, this.entryPointAddress]);
    }

    /** Fetch the bundler's receipt for a UserOperation, or null if not yet mined. */
    async getUserOperationReceipt(userOpHash: string): Promise<unknown | null> {
        await this.initializing;
        return await this.userOpJsonRpcProvider.send('eth_getUserOperationReceipt', [userOpHash]);
    }
}
