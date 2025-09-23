import { ethers, Interface } from "ethers";

import { AGNOSTIC_PROXY_ADDRESS as MAINNET_AGNOSTIC_PROXY_ADDRESS } from "../../artifacts/mainnet";
import { AGNOSTIC_PROXY_ADDRESS as TESTNET_AGNOSTIC_PROXY_ADDRESS } from "../../artifacts/testnet";
import { Network } from "../structs/Struct";


/**
 * NFTData is a struct that contains the nft, id, and amount of the nft
 * @param nft - The address of the nft
 * @param id - The id of the nft
 * @param amount - The amount of the nft to transfer(for ERC1155, but currently supported only ERC721)
 */
export interface NFTData {
    nft: string;
    id: bigint;
    amount: bigint;
}

/**
 * BridgeData is a struct that contains the tokens, nfts, and isRequired of the bridge data
 * @param tokens - The addresses of the tokens to bridge
 * @param nfts - The nfts to bridge
 * @param isRequired - Whether the bridge is required
 */
export interface BridgeData {
    tokens: string[];
    nfts: NFTData[];
    isRequired: boolean;
}

/**
 * HookType is an enum that contains the type of the hook
 * @param Custom - The custom hook
 * @param FullBalanceApprove - The full balance approve hook
 * @param FullBalanceTransfer - The full balance transfer hook
 */
export enum HookType {
    Custom = 0,
    FullBalanceApprove = 1,
    FullBalanceTransfer = 2
}

/**
 * ReplacementType is an enum that contains the type of the replacement
 * @param Amount - The amount replacement
 */
export enum ReplacementType {
    Amount = 0
}


/**
 * AmountChange is a struct that contains the position, length, token, and balance address of the amount change
 * @param position - The position of the amount change(position of the parameter in the function call)
 * @param len - The length of the amount change(length of the parameter in the function call)
 * @param token - The token of the amount change
 * @param balanceAddress - The balance address of the amount change(address to check balance for)
 */
export interface AmountChange {
    position: number;
    len: number;
    token: string;
    balanceAddress: string;
}

/**
 * CustomHookData is a struct that contains the isFromSAPerspective, contractAddress, value, data, and improvedMissionInfo of the custom hook
 * @param isFromSAPerspective - Whether the hook is from the smart account perspective or from proxy perspective
 * @param contractAddress - The address of the contract to call
 * @param value - The value of the hook
 * @param data - The data of the hook
 * @param improvedMissionInfo - The improved mission info of the hook
 */
export interface CustomHookData {
    isFromSAPerspective: boolean;
    contractAddress: string;
    value: bigint;
    data: string;
    improvedMissionInfo: string;
}

/**
 * ApproveHookData is a struct that contains the token, to, and isFromSAPerspective of the approve hook
 * @param token - The token to approve
 * @param to - The address to approve to
 * @param isFromSAPerspective - Whether the hook is from the smart account perspective or from proxy perspective
 */
export interface ApproveHookData {
    token: string;
    to: string;
    isFromSAPerspective: boolean;
}

/**
 * TransferHookData is a struct that contains the token, to, and isFromSAPerspective of the transfer hook
 * @param token - The token to transfer
 * @param to - The address to transfer to
 * @param isFromSAPerspective - Whether the hook is from the smart account perspective or from proxy perspective
 */
export interface TransferHookData {
    token: string;
    to: string;
    isFromSAPerspective: boolean;
}

/**
 * Hook is a struct that contains the hookType and hookData of the hook
 * @param hookType - The type of the hook
 * @param hookData - The data of the hook
 */
export interface Hook {
    hookType: HookType;
    hookData: string; // ABI encoded data specific to the hook type
}

/**
 * ZapCall is a struct that contains the hooks and bridgeData of the zap call
 * @param hooks - The hooks of the zap call
 * @param bridgeData - The bridge data of the zap call
 */
export interface ZapCall {
    hooks: Hook[];
    bridgeData: BridgeData;
}

/**
 * SDK for building AgnosticProxy Zap calls with efficient hook encoding
 * @param agnosticProxyAddress - The address of the agnostic proxy(optional)
 */
export class AgnosticProxySDK {
    private contractInterfaces: Map<string, Interface> = new Map();
    private agnosticProxyAddress: string;

    constructor(network: Network, agnosticProxyAddress?: string) {
        switch (network) {
            case Network.MAINNET:
                this.agnosticProxyAddress = agnosticProxyAddress ?? MAINNET_AGNOSTIC_PROXY_ADDRESS;
                break;
            case Network.TESTNET:
                this.agnosticProxyAddress = agnosticProxyAddress ?? TESTNET_AGNOSTIC_PROXY_ADDRESS;
                break;
            case Network.DEV:
                if (!agnosticProxyAddress) {
                    throw new Error("Agnostic proxy address is required for dev network");
                }
                this.agnosticProxyAddress = agnosticProxyAddress;
                break;
        }
    }

    /**
     * Add a contract interface for encoding function calls
     * Supports both human-readable ABI strings and generated ABI JSON objects
     * @param address - The address of the contract to add interface for
     * @param abi - The abi of the contract to add interface for
     * @returns The sdk instance
     */
    public addContractInterface(address: string, abi: any[]): this {
        const parsedAbi = this._parseAbi(abi);
        this.contractInterfaces.set(address.toLowerCase(), new Interface(parsedAbi));
        return this;
    }

    /**
     * Parse ABI - handles both human-readable strings and generated ABI JSON objects
     * Extracts only function definitions from JSON ABI
     */
    private _parseAbi(abi: any[]): string[] {
        const humanReadableAbi: string[] = [];
        
        for (const item of abi) {
            // If it's already a string (human-readable format), keep it
            if (typeof item === 'string') {
                humanReadableAbi.push(item);
                continue;
            }
            
            // If it's a JSON ABI object, parse it
            if (typeof item === 'object' && item.type) {
                // Only process functions
                if (item.type === 'function') {
                    const signature = this._buildFunctionSignature(item);
                    if (signature) {
                        humanReadableAbi.push(signature);
                    }
                }
                // Skip events, errors, constructor, etc.
            }
        }
        
        return humanReadableAbi;
    }

    /**
     * Build human-readable function signature from JSON ABI function object
     * @param func - The function to build signature for
     * @returns The signature of the function
     */
    private _buildFunctionSignature(func: any): string | null {
        if (!func.name || !Array.isArray(func.inputs)) {
            return null;
        }

        // Build parameter list
        const params = func.inputs.map((input: any) => {
            let paramType = input.type;
            
            // Handle array types
            if (input.type.includes('[]')) {
                paramType = input.type;
            }
            
            // Add parameter name if available
            if (input.name) {
                return `${paramType} ${input.name}`;
            }
            return paramType;
        }).join(', ');

        // Build return types if available
        let returnTypes = '';
        if (func.outputs && func.outputs.length > 0) {
            const outputs = func.outputs.map((output: any) => {
                const outputType = output.type;
                if (output.name) {
                    return `${outputType} ${output.name}`;
                }
                return outputType;
            }).join(', ');
            
            if (func.outputs.length === 1) {
                returnTypes = ` returns (${outputs})`;
            } else {
                returnTypes = ` returns (${outputs})`;
            }
        }

        // Build full signature
        const stateMutability = func.stateMutability || 'nonpayable';
        let mutabilityKeyword = '';
        
        if (stateMutability === 'view') {
            mutabilityKeyword = ' view';
        } else if (stateMutability === 'pure') {
            mutabilityKeyword = ' pure';
        } else if (stateMutability === 'payable') {
            mutabilityKeyword = ' payable';
        }

        return `function ${func.name}(${params})${mutabilityKeyword} external${returnTypes}`;
    }

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
        options: {
            isFromSAPerspective?: boolean;
            value?: bigint;
            dynamicReplacements?: AmountChange[];
        } = {}
    ): Hook {
        const {
            isFromSAPerspective = true,
            value = 0n,
            dynamicReplacements
        } = options;

        const contractInterface = this.contractInterfaces.get(contractAddress.toLowerCase());
        if (!contractInterface) {
            throw new Error(`Contract interface not found for address: ${contractAddress}`);
        }

        const data = contractInterface.encodeFunctionData(functionName, params);
        let improvedMissionInfo = "0x";

        // If dynamic replacements are specified, encode them
        if (dynamicReplacements && dynamicReplacements.length > 0) {
            // For now, support single replacement (can be extended)
            const replacement = dynamicReplacements[0]!;
            const replacementData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["tuple(uint16,uint16,address,address)"],
                [[replacement.position, replacement.len, replacement.token, replacement.balanceAddress]]
            );
            
            // Encode as ReplacementType.Amount with the replacement data
            improvedMissionInfo = ethers.AbiCoder.defaultAbiCoder().encode(
                ["uint8", "bytes"],
                [ReplacementType.Amount, replacementData]
            );
        }

        const customHookData: CustomHookData = {
            isFromSAPerspective,
            contractAddress,
            value,
            data,
            improvedMissionInfo
        };

        // Encode only the CustomHookData
        const encodedHookData = ethers.AbiCoder.defaultAbiCoder().encode(
            ["tuple(bool,address,uint256,bytes,bytes)"],
            [[
                customHookData.isFromSAPerspective,
                customHookData.contractAddress,
                customHookData.value,
                customHookData.data,
                customHookData.improvedMissionInfo
            ]]
        );

        return {
            hookType: HookType.Custom,
            hookData: encodedHookData
        };
    }

    /**
     * Create a full balance approve hook
     * @param token - The token to approve
     * @param to - The address to approve to
     * @param isFromSAPerspective - Whether the hook is from the smart account perspective or from proxy perspective
     * @returns The full balance approve hook
     */
    public createFullBalanceApproveHook(
        token: string,
        to: string,
        isFromSAPerspective: boolean = true
    ): Hook {
        const approveHookData: ApproveHookData = {
            token,
            to,
            isFromSAPerspective
        };

        // Encode only the ApproveHookData
        const encodedHookData = ethers.AbiCoder.defaultAbiCoder().encode(
            ["tuple(address,address,bool)"],
            [[approveHookData.token, approveHookData.to, approveHookData.isFromSAPerspective]]
        );

        return {
            hookType: HookType.FullBalanceApprove,
            hookData: encodedHookData
        };
    }

    /**
     * Create a full balance transfer hook
     * @param token - The token to transfer
     * @param to - The address to transfer to
     * @param isFromSAPerspective - Whether the hook is from the smart account perspective or from proxy perspective
     * @returns The full balance transfer hook
     */
    public createFullBalanceTransferHook(
        token: string,
        to: string,
        isFromSAPerspective: boolean = true
    ): Hook {
        const transferHookData: TransferHookData = {
            token,
            to,
            isFromSAPerspective
        };

        // Encode only the TransferHookData
        const encodedHookData = ethers.AbiCoder.defaultAbiCoder().encode(
            ["tuple(address,address,bool)"],
            [[transferHookData.token, transferHookData.to, transferHookData.isFromSAPerspective]]
        );

        return {
            hookType: HookType.FullBalanceTransfer,
            hookData: encodedHookData
        };
    }

    /**
     * Helper to create dynamic amount replacement for a specific parameter
     * @param paramIndex - The index of the parameter to replace
     * @param token - The token to replace
     * @param balanceAddress - The address to replace the parameter with
     * @returns The amount replacement
     */
    public createAmountReplacement(
        paramIndex: number,
        token: string,
        balanceAddress: string
    ): AmountChange {
        // Calculate position in calldata (4 bytes selector + 32 bytes per param)
        const position = 4 + (paramIndex * 32);
        return {
            position,
            len: 32, // uint256 is 32 bytes
            token,
            balanceAddress
        };
    }

    /**
     * Advanced replacement calculator - calculates position and length for any parameter type
     * Required that you have added the contract interface first using addContractInterface().
     * If human readable abi is used, need to provide function and params names also
     * @param contractAddress - The address of the contract to call
     * @param functionName - The name of the function to call
     * @param parameterName - The name of the parameter to replace
     * @param token - The token to replace
     * @param balanceAddress - The address to replace the parameter with
     * @returns The replacement data
     */
    public calculateReplacementData(
        contractAddress: string,
        functionName: string,
        parameterName: string,
        token: string,
        balanceAddress: string
    ): AmountChange {
        const contractInterface = this.contractInterfaces.get(contractAddress.toLowerCase());
        if (!contractInterface) {
            throw new Error(`Contract interface not found for address: ${contractAddress}. Please add it first using addContractInterface().`);
        }

        let functionFragment;
        try {
            functionFragment = contractInterface.getFunction(functionName);
        } catch {
            throw new Error(`Function '${functionName}' not found in contract interface for ${contractAddress}`);
        }

        if (!functionFragment) {
            throw new Error(`Function '${functionName}' not found in contract interface for ${contractAddress}`);
        }

        // Find the parameter by name
        const paramIndex = functionFragment.inputs.findIndex(input => input.name === parameterName);
        if (paramIndex === -1) {
            const availableParams = functionFragment.inputs.map(input => `${input.name} (${input.type})`).join(', ');
            throw new Error(`Parameter '${parameterName}' not found in function '${functionName}'. Available parameters: ${availableParams}`);
        }

        const param = functionFragment.inputs[paramIndex];
        
        // Calculate position and length based on parameter type
        const { position, len } = this._calculateParamPositionAndLength(functionFragment.inputs, paramIndex);

        return {
            position,
            len,
            token,
            balanceAddress
        };
    }

    /**
     * Get replacement helper - shows available functions and parameters for a contract
     * Required that you have added the contract interface first using addContractInterface().
     * If human readable abi is used, need to provide function and params names also
     * @param contractAddress - The address of the contract to call
     * @returns The replacement helper
     */
    public getReplacementHelper(contractAddress: string): {
        contractAddress: string;
        functions: {
            name: string;
            signature: string;
            parameters: {
                name: string;
                type: string;
                index: number;
                canReplace: boolean;
                reason?: string;
            }[];
        }[];
    } {
        const contractInterface = this.contractInterfaces.get(contractAddress.toLowerCase());
        if (!contractInterface) {
            throw new Error(`Contract interface not found for address: ${contractAddress}. Please add it first using addContractInterface().`);
        }

        const functions = contractInterface.fragments
            .filter(fragment => fragment.type === 'function')
            .map(fragment => {
                const func = fragment as ethers.FunctionFragment;
                return {
                    name: func.name,
                    signature: func.format('full'),
                    parameters: func.inputs.map((input, index) => {
                        const canReplace = this._canParameterBeReplaced(input.type);
                        return {
                            name: input.name || `param${index}`,
                            type: input.type,
                            index,
                            canReplace: canReplace.canReplace,
                            reason: canReplace.reason
                        };
                    })
                };
            });

        return {
            contractAddress,
            functions
        };
    }

    /**
     * Interactive replacement builder - helps build replacement step by step
     * @param contractAddress - The address of the contract to call
     * @param functionName - The name of the function to call
     * @param parameterName - The name of the parameter to replace
     * @param token - The token to replace
     * @param balanceAddress - The address to replace the parameter with
     * @param options - The options of the interactive replacement builder
     * @returns The interactive replacement builder
     */
    public buildReplacementInteractive(
        contractAddress: string,
        functionName: string,
        parameterName: string,
        token: string,
        balanceAddress: string,
        options: {
            showCalculation?: boolean;
            validate?: boolean;
        } = {}
    ): {
        replacement: AmountChange;
        calculation: {
            functionSignature: string;
            parameterInfo: {
                name: string;
                type: string;
                index: number;
                position: number;
                length: number;
            };
            positionCalculation: string;
        };
        validation: {
            isValid: boolean;
            warnings: string[];
            suggestions: string[];
        };
    } {
        const { showCalculation = true, validate = true } = options;

        // Get the replacement data
        const replacement = this.calculateReplacementData(contractAddress, functionName, parameterName, token, balanceAddress);

        // Get function info for calculation details
        const contractInterface = this.contractInterfaces.get(contractAddress.toLowerCase());
        if (!contractInterface) {
            throw new Error(`Contract interface not found for address: ${contractAddress}`);
        }
        
        const functionFragment = contractInterface.getFunction(functionName);
        if (!functionFragment) {
            throw new Error(`Function '${functionName}' not found in contract interface for ${contractAddress}`);
        }
        
        const paramIndex = functionFragment.inputs.findIndex(input => input.name === parameterName);
        const param = functionFragment.inputs[paramIndex]!;

        const calculation = {
            functionSignature: functionFragment.format('full'),
            parameterInfo: {
                name: parameterName,
                type: param.type,
                index: paramIndex,
                position: replacement.position,
                length: replacement.len
            },
            positionCalculation: `Position = 4 bytes (selector) + ${paramIndex} * 32 bytes = ${replacement.position} bytes`
        };

        // Validation
        const validation = {
            isValid: true,
            warnings: [] as string[],
            suggestions: [] as string[]
        };

        if (validate) {
            // Check if parameter type is suitable for replacement
            const typeCheck = this._canParameterBeReplaced(param.type);
            if (!typeCheck.canReplace) {
                validation.isValid = false;
                validation.warnings.push(`Parameter type '${param.type}' ${typeCheck.reason}`);
            }

            // Check if it's a reasonable parameter to replace
            if (param.name.toLowerCase().includes('amount') || param.name.toLowerCase().includes('value')) {
                validation.suggestions.push(`✅ Parameter '${param.name}' looks suitable for dynamic replacement`);
            } else {
                validation.warnings.push(`⚠️ Parameter '${param.name}' might not be intended for amount replacement`);
            }

            // Check token address
            if (!ethers.isAddress(token)) {
                validation.isValid = false;
                validation.warnings.push(`Invalid token address: ${token}`);
            }

            if (!ethers.isAddress(balanceAddress)) {
                validation.isValid = false;
                validation.warnings.push(`Invalid balance address: ${balanceAddress}`);
            }
        }

        return {
            replacement,
            calculation,
            validation
        };
    }

    /**
     * Private helper to calculate position and length for complex parameter types
     * @param inputs - The inputs of the function
     * @param targetIndex - The index of the parameter to calculate the position and length for
     * @returns The position and length of the parameter
     */
    private _calculateParamPositionAndLength(inputs: readonly ethers.ParamType[], targetIndex: number): { position: number; len: number } {
        // For now, we support simple types. Complex types (arrays, structs) would need more sophisticated calculation
        // This is a simplified version that works for basic types like uint256, address, etc.
        
        let position = 4; // Start after function selector
        
        for (let i = 0; i < targetIndex; i++) {
            const paramType = inputs[i]!.type;
            position += this._getTypeSize(paramType);
        }

        const targetType = inputs[targetIndex]!.type;
        const len = this._getTypeSize(targetType);

        return { position, len };
    }

    /**
     * Get the size in bytes for a parameter type
     * @param type - The type of the parameter
     * @returns The size in bytes of the parameter
     */
    private _getTypeSize(type: string): number {
        // Basic types are all 32 bytes in calldata (due to ABI encoding)
        if (type.startsWith('uint') || type.startsWith('int') || type === 'address' || type === 'bool' || type.startsWith('bytes32')) {
            return 32;
        }
        
        // Dynamic types (bytes, string) are also 32 bytes for the offset
        if (type === 'bytes' || type === 'string') {
            return 32;
        }

        // Arrays are 32 bytes for the offset
        if (type.includes('[]')) {
            return 32;
        }

        // Default to 32 bytes for unknown types
        return 32;
    }

    /**
     * Check if a parameter type can be replaced with a balance
     * @param type - The type of the parameter
     * @returns The can replace and reason of the parameter
     */
    private _canParameterBeReplaced(type: string): { canReplace: boolean; reason?: string } {
        if (type.startsWith('uint') && !type.includes('[]')) {
            return { canReplace: true };
        }
        
        if (type.startsWith('int') && !type.includes('[]')) {
            return { canReplace: true, reason: 'but be careful with signed integers' };
        }

        return { 
            canReplace: false, 
            reason: `is not suitable for balance replacement. Only uint/int types are supported.` 
        };
    }

    /**
     * Build a complete ZapCall
     * @param hooks - The hooks of the zap call
     * @param bridgeTokens - The tokens to bridge
     * @param bridgeNFTs - The nfts to bridge
     * @returns The zap call
     */
    public buildZapCall(
        hooks: Hook[],
        bridgeTokens: string[] = [],
        bridgeNFTs: NFTData[] = [],
    ): ZapCall {
        return {
            hooks,
            bridgeData: {
            tokens: bridgeTokens,
            nfts: bridgeNFTs,
            isRequired: (bridgeTokens.length > 0 || bridgeNFTs.length > 0) ? true : false
            }
        };
    }

    /**
     * Encode ZapCall for transaction - Much more efficient now!
     * @param zapCall - The zap call to encode
     * @returns The encoded zap call that can be used as calldata in tac sdk
     */
    public encodeZapCall(zapCall: ZapCall): string {
        return ethers.AbiCoder.defaultAbiCoder().encode(
            [
                "tuple(" +
                    "tuple(uint8,bytes)[]," + // hooks: only hookType and hookData
                    "tuple(address[],tuple(address,uint256,uint256)[],bool)" + // bridgeData
                ")"
            ],
            [
                [
                    zapCall.hooks.map(hook => [hook.hookType, hook.hookData]),
                    [
                        zapCall.bridgeData.tokens,
                        zapCall.bridgeData.nfts.map(nft => [nft.nft, nft.id, nft.amount]),
                        zapCall.bridgeData.isRequired
                    ]
                ]
            ]
        );
    }

    /**
     * Utility: Create multiple approve hooks at once
     * @param approvals - The approvals to create
     * @returns The multiple approve hooks
     */
    public createMultipleApproves(
        approvals: { token: string; spender: string; isFromSA?: boolean }[]
    ): Hook[] {
        return approvals.map(approval => 
            this.createFullBalanceApproveHook(
                approval.token, 
                approval.spender, 
                approval.isFromSA ?? true
            )
        );
    }

    /**
     * Utility: Create a sequence of custom hooks
     * @param calls - The calls to create
     * @returns The hook sequence
     */
    public createHookSequence(
        calls: {
            contract: string;
            functionName: string;
            params: any[];
            options?: {
                isFromSAPerspective?: boolean;
                value?: bigint;
                dynamicReplacements?: AmountChange[];
            };
        }[]
    ): Hook[] {
        return calls.map(call => 
            this.createCustomHook(
                call.contract,
                call.functionName,
                call.params,
                call.options
            )
        );
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
                        ["tuple(bool,address,uint256,bytes,bytes)"],
                        hook.hookData
                    )[0];
                case HookType.FullBalanceApprove:
                    return ethers.AbiCoder.defaultAbiCoder().decode(
                        ["tuple(address,address,bool)"],
                        hook.hookData
                    )[0];
                case HookType.FullBalanceTransfer:
                    return ethers.AbiCoder.defaultAbiCoder().decode(
                        ["tuple(address,address,bool)"],
                        hook.hookData
                    )[0];
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
        
        zapCall.hooks.forEach(hook => {
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
    public visualizeZapCall(zapCall: ZapCall): void {
        console.log("🔗 ZapCall Chain Visualization");
        console.log("================================");
        
        if (zapCall.hooks.length === 0) {
            console.log("❌ No hooks in this ZapCall");
            return;
        }

        zapCall.hooks.forEach((hook, index) => {
            const stepNumber = (index + 1).toString().padStart(2, " ");
            console.log(`\n${stepNumber}. ${this._describeHook(hook)}`);
        });

        // Bridge information
        if (zapCall.bridgeData.isRequired) {
            console.log("\n🌉 Bridge Operations:");
            if (zapCall.bridgeData.tokens.length > 0) {
                console.log(`   📤 Bridge tokens: ${zapCall.bridgeData.tokens.map(t => this._formatAddress(t)).join(", ")}`);
            }
            if (zapCall.bridgeData.nfts.length > 0) {
                console.log(`   🖼️  Bridge NFTs: ${zapCall.bridgeData.nfts.length} NFT(s)`);
                zapCall.bridgeData.nfts.forEach((nft, i) => {
                    console.log(`      ${i + 1}. ${this._formatAddress(nft.nft)} #${nft.id} (amount: ${nft.amount})`);
                });
            }
        } else {
            console.log("\n🚫 No bridge operations required");
        }

        // Summary
        console.log("\n📊 Summary:");
        console.log(`   Total hooks: ${zapCall.hooks.length}`);
        console.log(`   Estimated gas: ${this.estimateGasUsage(zapCall).toLocaleString()}`);
        console.log(`   Bridge required: ${zapCall.bridgeData.isRequired ? "Yes" : "No"}`);
        console.log("================================");
    }

    /**
     * Private helper to describe individual hooks
     * @param hook - The hook to describe
     * @returns The description of the hook
     */
    private _describeHook(hook: Hook): string {
        try {
            switch (hook.hookType) {
                case HookType.Custom:
                    return this._describeCustomHook(hook);
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
    private _describeCustomHook(hook: Hook): string {
        const decoded = this.decodeHookData(hook);
        const [isFromSA, contractAddress, value, data, improvedMissionInfo] = decoded;
        
        // Try to decode function name from data
        let functionDescription = "unknown function";
        let hasReplacements = false;
        
        if (data && data.length >= 10) { // At least 4 bytes for selector + some data
            const selector = data.slice(0, 10); // "0x" + 8 hex chars
            
            // Try to find function name from registered interfaces
            for (const [address, contractInterface] of this.contractInterfaces) {
                if (address === contractAddress.toLowerCase()) {
                    try {
                        const fragment = contractInterface.getFunction(selector);
                        if (fragment) {
                            functionDescription = `${fragment.name}(${fragment.inputs.map(input => input.type).join(", ")})`;
                            break;
                        }
                    } catch {
                        // Function not found in this interface
                    }
                }
            }
            
            // If not found in registered interfaces, just show selector
            if (functionDescription === "unknown function") {
                functionDescription = `function with selector ${selector}`;
            }
        }

        // Check for dynamic replacements
        if (improvedMissionInfo && improvedMissionInfo !== "0x" && improvedMissionInfo.length > 2) {
            hasReplacements = true;
        }

        const perspective = isFromSA ? "Smart Account" : "Proxy Contract";
        const valueStr = value > 0n ? ` (sending ${ethers.formatEther(value)} ETH)` : "";
        const replacementStr = hasReplacements ? " 🔄 [with dynamic value replacement]" : "";
        
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
        
        const perspective = isFromSA ? "Smart Account" : "Proxy Contract";
        
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
        
        const perspective = isFromSA ? "Smart Account" : "Proxy Contract";
        
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
    public getZapCallBreakdown(zapCall: ZapCall): {
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
            hookDescriptions.push(`${index + 1}. ${this._describeHook(hook)}`);
        });

        return {
            totalHooks: zapCall.hooks.length,
            hookTypes,
            gasEstimate: this.estimateGasUsage(zapCall),
            encodedSize: this.encodeZapCall(zapCall).length / 2, // bytes
            bridgeRequired: zapCall.bridgeData.isRequired,
            hookDescriptions
        };
    }

    /**
     * Compare two ZapCalls and show differences
     * @param zapCall1 - The first zap call to compare
     * @param zapCall2 - The second zap call to compare
     * @param label1 - The label of the first zap call
     * @param label2 - The label of the second zap call
     */
    public compareZapCalls(zapCall1: ZapCall, zapCall2: ZapCall, label1: string = "ZapCall 1", label2: string = "ZapCall 2"): void {
        console.log(`🔄 Comparing ${label1} vs ${label2}`);
        console.log("=".repeat(50));

        const breakdown1 = this.getZapCallBreakdown(zapCall1);
        const breakdown2 = this.getZapCallBreakdown(zapCall2);

        console.log(`📊 ${label1}:`);
        console.log(`   Hooks: ${breakdown1.totalHooks}, Gas: ${breakdown1.gasEstimate.toLocaleString()}, Size: ${breakdown1.encodedSize} bytes`);
        
        console.log(`📊 ${label2}:`);
        console.log(`   Hooks: ${breakdown2.totalHooks}, Gas: ${breakdown2.gasEstimate.toLocaleString()}, Size: ${breakdown2.encodedSize} bytes`);

        console.log("\n📈 Differences:");
        console.log(`   Hooks: ${breakdown2.totalHooks - breakdown1.totalHooks > 0 ? "+" : ""}${breakdown2.totalHooks - breakdown1.totalHooks}`);
        console.log(`   Gas: ${breakdown2.gasEstimate - breakdown1.gasEstimate > 0 ? "+" : ""}${(breakdown2.gasEstimate - breakdown1.gasEstimate).toLocaleString()}`);
        console.log(`   Size: ${breakdown2.encodedSize - breakdown1.encodedSize > 0 ? "+" : ""}${breakdown2.encodedSize - breakdown1.encodedSize} bytes`);
    }

    getAgnosticCallParams(): { evmTargetAddress: string, methodName: string } {
        return {
            evmTargetAddress: this.agnosticProxyAddress,
            methodName: "Zap(bytes,bytes)",
        };
    }
}