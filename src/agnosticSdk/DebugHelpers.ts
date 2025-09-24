import { ethers, Interface } from 'ethers';

import { Hook, HookType,NFTData, ZapCall } from './AgnosticStructs';

export class DebugHelpers {

    /**
     * Build a complete ZapCall
     * @param hooks - The hooks of the zap call
     * @param bridgeTokens - The tokens to bridge
     * @param bridgeNFTs - The nfts to bridge
     * @returns The zap call
     */
    public buildZapCall(hooks: Hook[], bridgeTokens: string[] = [], bridgeNFTs: NFTData[] = []): ZapCall {
        return {
            hooks,
            bridgeData: {
                tokens: bridgeTokens,
                nfts: bridgeNFTs,
                isRequired: bridgeTokens.length > 0 || bridgeNFTs.length > 0 ? true : false,
            },
        };
    }

    /**
     * Debug helper: Decode hook data back to readable format
     * @param hook - The hook to decode
     * @returns The decoded hook
     */
    public decodeHookData(hook: Hook): any {
        try {
            switch (hook.hookType) {
                case HookType.Custom:
                    return ethers.AbiCoder.defaultAbiCoder().decode(
                        ['tuple(bool,address,uint256,bytes,bytes)'],
                        hook.hookData,
                    )[0];
                case HookType.FullBalanceApprove:
                    return ethers.AbiCoder.defaultAbiCoder().decode(['tuple(address,address,bool)'], hook.hookData)[0];
                case HookType.FullBalanceTransfer:
                    return ethers.AbiCoder.defaultAbiCoder().decode(['tuple(address,address,bool)'], hook.hookData)[0];
                default:
                    throw new Error(`Unknown hook type: ${hook.hookType}`);
            }
        } catch (error) {
            throw new Error(`Failed to decode hook data: ${error}`);
        }
    }

    /**
     * Debug helper: Get estimated gas for a ZapCall
     * @param zapCall - The zap call to estimate the gas usage for
     * @returns The estimated gas usage
     */
    public estimateGasUsage(zapCall: ZapCall): number {
        // Rough estimation based on hook types and operations
        let gasEstimate = 50000; // Base gas

        zapCall.hooks.forEach((hook) => {
            switch (hook.hookType) {
                case HookType.Custom:
                    gasEstimate += 100000; // Custom calls can vary widely
                    break;
                case HookType.FullBalanceApprove:
                    gasEstimate += 50000; // ERC20 approve
                    break;
                case HookType.FullBalanceTransfer:
                    gasEstimate += 65000; // ERC20 transfer
                    break;
            }
        });

        if (zapCall.bridgeData.isRequired) {
            gasEstimate += 200000; // Bridge operations
        }

        return gasEstimate;
    }

    /**
     * Visualize ZapCall chain - Human readable description of all operations
     * @param zapCall - The zap call to visualize
     */
    public visualizeZapCall(zapCall: ZapCall, contractInterfaces: Map<string, Interface>): void {
        console.log('🔗 ZapCall Chain Visualization');
        console.log('================================');

        if (zapCall.hooks.length === 0) {
            console.log('❌ No hooks in this ZapCall');
            return;
        }

        zapCall.hooks.forEach((hook, index) => {
            const stepNumber = (index + 1).toString().padStart(2, ' ');
            console.log(`\n${stepNumber}. ${this._describeHook(hook, contractInterfaces)}`);
        });

        // Bridge information
        if (zapCall.bridgeData.isRequired) {
            console.log('\n🌉 Bridge Operations:');
            if (zapCall.bridgeData.tokens.length > 0) {
                console.log(
                    `   📤 Bridge tokens: ${zapCall.bridgeData.tokens.map((t) => this._formatAddress(t)).join(', ')}`,
                );
            }
            if (zapCall.bridgeData.nfts.length > 0) {
                console.log(`   🖼️  Bridge NFTs: ${zapCall.bridgeData.nfts.length} NFT(s)`);
                zapCall.bridgeData.nfts.forEach((nft, i) => {
                    console.log(`      ${i + 1}. ${this._formatAddress(nft.nft)} #${nft.id} (amount: ${nft.amount})`);
                });
            }
        } else {
            console.log('\n🚫 No bridge operations required');
        }

        // Summary
        console.log('\n📊 Summary:');
        console.log(`   Total hooks: ${zapCall.hooks.length}`);
        console.log(`   Estimated gas: ${this.estimateGasUsage(zapCall).toLocaleString()}`);
        console.log(`   Bridge required: ${zapCall.bridgeData.isRequired ? 'Yes' : 'No'}`);
        console.log('================================');
    }

    /**
     * Private helper to describe individual hooks
     * @param hook - The hook to describe
     * @returns The description of the hook
     */
    private _describeHook(hook: Hook, contractInterfaces: Map<string, Interface>): string {
        try {
            switch (hook.hookType) {
                case HookType.Custom:
                    return this._describeCustomHook(hook, contractInterfaces);
                case HookType.FullBalanceApprove:
                    return this._describeApproveHook(hook);
                case HookType.FullBalanceTransfer:
                    return this._describeTransferHook(hook);
                default:
                    return `❓ Unknown hook type: ${hook.hookType}`;
            }
        } catch (error) {
            return `❌ Error describing hook: ${error}`;
        }
    }

    /**
     * Describe custom hook with function details
     * @param hook - The hook to describe
     * @returns The description of the hook
     */
    private _describeCustomHook(hook: Hook, contractInterfaces: Map<string, Interface>): string {
        const decoded = this.decodeHookData(hook);
        const [isFromSA, contractAddress, value, data, improvedMissionInfo] = decoded;

        // Try to decode function name from data
        let functionDescription = 'unknown function';
        let hasReplacements = false;

        if (data && data.length >= 10) {
            // At least 4 bytes for selector + some data
            const selector = data.slice(0, 10); // "0x" + 8 hex chars

            // Try to find function name from registered interfaces
            for (const [address, contractInterface] of contractInterfaces) {
                if (address === contractAddress.toLowerCase()) {
                    try {
                        const fragment = contractInterface.getFunction(selector);
                        if (fragment) {
                            functionDescription = `${fragment.name}(${fragment.inputs.map((input) => input.type).join(', ')})`;
                            break;
                        }
                    } catch {
                        // Function not found in this interface
                    }
                }
            }

            // If not found in registered interfaces, just show selector
            if (functionDescription === 'unknown function') {
                functionDescription = `function with selector ${selector}`;
            }
        }

        // Check for dynamic replacements
        if (improvedMissionInfo && improvedMissionInfo !== '0x' && improvedMissionInfo.length > 2) {
            hasReplacements = true;
        }

        const perspective = isFromSA ? 'Smart Account' : 'Proxy Contract';
        const valueStr = value > 0n ? ` (sending ${ethers.formatEther(value)} ETH)` : '';
        const replacementStr = hasReplacements ? ' 🔄 [with dynamic value replacement]' : '';

        return `📞 Custom call to ${this._formatAddress(contractAddress)} from ${perspective}${valueStr}
     Function: ${functionDescription}${replacementStr}`;
    }

    /**
     * Describe approve hook
     * @param hook - The hook to describe
     * @returns The description of the hook
     */
    private _describeApproveHook(hook: Hook): string {
        const decoded = this.decodeHookData(hook);
        const [token, to, isFromSA] = decoded;

        const perspective = isFromSA ? 'Smart Account' : 'Proxy Contract';

        return `✅ Approve full balance of ${this._formatAddress(token)} to ${this._formatAddress(to)} from ${perspective}`;
    }

    /**
     * Describe transfer hook
     * @param hook - The hook to describe
     * @returns The description of the hook
     */
    private _describeTransferHook(hook: Hook): string {
        const decoded = this.decodeHookData(hook);
        const [token, to, isFromSA] = decoded;

        const perspective = isFromSA ? 'Smart Account' : 'Proxy Contract';

        return `💸 Transfer full balance of ${this._formatAddress(token)} to ${this._formatAddress(to)} from ${perspective}`;
    }

    /**
     * Format address for display (show first 6 and last 4 characters)
     * @param address - The address to format
     * @returns The formatted address
     */
    private _formatAddress(address: string): string {
        if (!address || address.length < 10) return address;
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    }

    /**
     * Get a detailed breakdown of a ZapCall for logging
     * @param zapCall - The zap call to get the breakdown for
     * @returns The breakdown of the zap call
     */
    public getZapCallBreakdown(zapCall: ZapCall, contractInterfaces: Map<string, Interface>): {
        totalHooks: number;
        hookTypes: { [key: string]: number };
        gasEstimate: number;
        encodedSize: number;
        bridgeRequired: boolean;
        hookDescriptions: string[];
    } {
        const hookTypes: { [key: string]: number } = {};
        const hookDescriptions: string[] = [];

        zapCall.hooks.forEach((hook, index) => {
            const typeName = HookType[hook.hookType];
            hookTypes[typeName] = (hookTypes[typeName] || 0) + 1;
            hookDescriptions.push(`${index + 1}. ${this._describeHook(hook, contractInterfaces)}`);
        });

        return {
            totalHooks: zapCall.hooks.length,
            hookTypes,
            gasEstimate: this.estimateGasUsage(zapCall),
            encodedSize: this.encodeZapCall(zapCall).length / 2, // bytes
            bridgeRequired: zapCall.bridgeData.isRequired,
            hookDescriptions,
        };
    }

    /**
     * Compare two ZapCalls and show differences
     * @param zapCall1 - The first zap call to compare
     * @param zapCall2 - The second zap call to compare
     * @param label1 - The label of the first zap call
     * @param label2 - The label of the second zap call
     */
    public compareZapCalls(
        zapCall1: ZapCall,
        zapCall2: ZapCall,
        label1: string = 'ZapCall 1',
        label2: string = 'ZapCall 2',
        contractInterfaces: Map<string, Interface>,
    ): void {
        console.log(`🔄 Comparing ${label1} vs ${label2}`);
        console.log('='.repeat(50));

        const breakdown1 = this.getZapCallBreakdown(zapCall1, contractInterfaces);
        const breakdown2 = this.getZapCallBreakdown(zapCall2, contractInterfaces);

        console.log(`📊 ${label1}:`);
        console.log(
            `   Hooks: ${breakdown1.totalHooks}, Gas: ${breakdown1.gasEstimate.toLocaleString()}, Size: ${breakdown1.encodedSize} bytes`,
        );

        console.log(`📊 ${label2}:`);
        console.log(
            `   Hooks: ${breakdown2.totalHooks}, Gas: ${breakdown2.gasEstimate.toLocaleString()}, Size: ${breakdown2.encodedSize} bytes`,
        );

        console.log('\n📈 Differences:');
        console.log(
            `   Hooks: ${breakdown2.totalHooks - breakdown1.totalHooks > 0 ? '+' : ''}${breakdown2.totalHooks - breakdown1.totalHooks}`,
        );
        console.log(
            `   Gas: ${breakdown2.gasEstimate - breakdown1.gasEstimate > 0 ? '+' : ''}${(breakdown2.gasEstimate - breakdown1.gasEstimate).toLocaleString()}`,
        );
        console.log(
            `   Size: ${breakdown2.encodedSize - breakdown1.encodedSize > 0 ? '+' : ''}${breakdown2.encodedSize - breakdown1.encodedSize} bytes`,
        );
    }

    /**
     * Encode ZapCall for transaction
     * @param zapCall - The zap call to encode
     * @returns The encoded zap call that can be used as calldata in tac sdk
     */
    public encodeZapCall(zapCall: ZapCall): string {
        return ethers.AbiCoder.defaultAbiCoder().encode(
            [
                'tuple(' +
                    'tuple(uint8,bytes)[],' + // hooks: only hookType and hookData
                    'tuple(address[],tuple(address,uint256,uint256)[],bool)' + // bridgeData
                    ')',
            ],
            [
                [
                    zapCall.hooks.map((hook) => [hook.hookType, hook.hookData]),
                    [
                        zapCall.bridgeData.tokens,
                        zapCall.bridgeData.nfts.map((nft) => [nft.nft, nft.id, nft.amount]),
                        zapCall.bridgeData.isRequired,
                    ],
                ],
            ],
        );
    }
}