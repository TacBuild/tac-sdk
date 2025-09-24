import { ethers, Interface } from 'ethers';

import { AmountChange, ApproveHookData, CustomHookData, Hook, HookType, ReplacementType, TransferHookData } from './AgnosticStructs';

export class HooksHandler {
    /**
     * Create a custom hook with optional dynamic value replacement
     * @param contractAddress - The address of the contract to call
     * @param functionName - The name of the function to call
     * @param params - The parameters of the function to call
     * @param options - The options of the custom hook
     * @returns The custom hook
     */
    public createCustomHook(
        contractAddress: string,
        functionName: string,
        params: any[],
        contractInterfaces: Map<string, Interface>,
        options: {
            isFromSAPerspective?: boolean;
            value?: bigint;
            dynamicReplacements?: AmountChange[];
        } = {},
    ): Hook {
        const { isFromSAPerspective = true, value = 0n, dynamicReplacements } = options;

        const contractInterface = contractInterfaces.get(contractAddress.toLowerCase());
        if (!contractInterface) {
            throw new Error(`Contract interface not found for address: ${contractAddress}`);
        }

        const data = contractInterface.encodeFunctionData(functionName, params);
        let improvedMissionInfo = '0x';

        // If dynamic replacements are specified, encode them
        if (dynamicReplacements && dynamicReplacements.length > 0) {
            // For now, support single replacement (can be extended)
            const replacement = dynamicReplacements[0]!;
            const replacementData = ethers.AbiCoder.defaultAbiCoder().encode(
                ['tuple(uint16,uint16,address,address)'],
                [[replacement.position, replacement.len, replacement.token, replacement.balanceAddress]],
            );

            // Encode as ReplacementType.Amount with the replacement data
            improvedMissionInfo = ethers.AbiCoder.defaultAbiCoder().encode(
                ['uint8', 'bytes'],
                [ReplacementType.Amount, replacementData],
            );
        }

        const customHookData: CustomHookData = {
            isFromSAPerspective,
            contractAddress,
            value,
            data,
            improvedMissionInfo,
        };

        // Encode only the CustomHookData
        const encodedHookData = ethers.AbiCoder.defaultAbiCoder().encode(
            ['tuple(bool,address,uint256,bytes,bytes)'],
            [
                [
                    customHookData.isFromSAPerspective,
                    customHookData.contractAddress,
                    customHookData.value,
                    customHookData.data,
                    customHookData.improvedMissionInfo,
                ],
            ],
        );

        return {
            hookType: HookType.Custom,
            hookData: encodedHookData,
        };
    }

    /**
     * Create a full balance approve hook
     * @param token - The token to approve
     * @param to - The address to approve to
     * @param isFromSAPerspective - Whether the hook is from the smart account perspective or from proxy perspective
     * @returns The full balance approve hook
     */
    public createFullBalanceApproveHook(token: string, to: string, isFromSAPerspective: boolean = true): Hook {
        const approveHookData: ApproveHookData = {
            token,
            to,
            isFromSAPerspective,
        };

        // Encode only the ApproveHookData
        const encodedHookData = ethers.AbiCoder.defaultAbiCoder().encode(
            ['tuple(address,address,bool)'],
            [[approveHookData.token, approveHookData.to, approveHookData.isFromSAPerspective]],
        );

        return {
            hookType: HookType.FullBalanceApprove,
            hookData: encodedHookData,
        };
    }

    /**
     * Create a full balance transfer hook
     * @param token - The token to transfer
     * @param to - The address to transfer to
     * @param isFromSAPerspective - Whether the hook is from the smart account perspective or from proxy perspective
     * @returns The full balance transfer hook
     */
    public createFullBalanceTransferHook(token: string, to: string, isFromSAPerspective: boolean = true): Hook {
        const transferHookData: TransferHookData = {
            token,
            to,
            isFromSAPerspective,
        };

        // Encode only the TransferHookData
        const encodedHookData = ethers.AbiCoder.defaultAbiCoder().encode(
            ['tuple(address,address,bool)'],
            [[transferHookData.token, transferHookData.to, transferHookData.isFromSAPerspective]],
        );

        return {
            hookType: HookType.FullBalanceTransfer,
            hookData: encodedHookData,
        };
    }

    /**
     * Utility: Create multiple approve hooks at once
     * @param approvals - The approvals to create
     * @returns The multiple approve hooks
     */
    public createMultipleApproves(approvals: { token: string; spender: string; isFromSA?: boolean }[]): Hook[] {
        return approvals.map((approval) =>
            this.createFullBalanceApproveHook(approval.token, approval.spender, approval.isFromSA ?? true),
        );
    }

}