import { ethers, Interface } from 'ethers';

import { AmountChange } from './AgnosticStructs';

export class ReplacementHelper {
    /**
     * Helper to create dynamic amount replacement for a specific parameter
     * @param paramIndex - The index of the parameter to replace
     * @param token - The token to replace
     * @param balanceAddress - The address to replace the parameter with
     * @returns The amount replacement
     */
public createAmountReplacement(paramIndex: number, token: string, balanceAddress: string): AmountChange {
    // Calculate position in calldata (4 bytes selector + 32 bytes per param)
    const position = 4 + paramIndex * 32;
    return {
        position,
        len: 32, // uint256 is 32 bytes
        token,
        balanceAddress,
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
    balanceAddress: string,
    contractInterfaces: Map<string, Interface>,
): AmountChange {
    const contractInterface = contractInterfaces.get(contractAddress.toLowerCase());
    if (!contractInterface) {
        throw new Error(
            `Contract interface not found for address: ${contractAddress}. Please add it first using addContractInterface().`,
        );
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
    const paramIndex = functionFragment.inputs.findIndex((input: { name: string; }) => input.name === parameterName);
    if (paramIndex === -1) {
        const availableParams = functionFragment.inputs.map((input: { name: string; type: string; }) => `${input.name} (${input.type})`).join(', ');
        throw new Error(
            `Parameter '${parameterName}' not found in function '${functionName}'. Available parameters: ${availableParams}`,
        );
    }
    // Calculate position and length based on parameter type
    const { position, len } = this._calculateParamPositionAndLength(functionFragment.inputs, paramIndex);

    return {
        position,
        len,
        token,
        balanceAddress,
    };
}

/**
 * Get replacement helper - shows available functions and parameters for a contract
 * Required that you have added the contract interface first using addContractInterface().
 * If human readable abi is used, need to provide function and params names also
 * @param contractAddress - The address of the contract to call
 * @returns The replacement helper
 */
public getReplacementHelper(contractAddress: string, contractInterfaces: Map<string, Interface>): {
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
    const contractInterface = contractInterfaces.get(contractAddress.toLowerCase());
    if (!contractInterface) {
        throw new Error(
            `Contract interface not found for address: ${contractAddress}. Please add it first using addContractInterface().`,
        );
    }

    const functions = contractInterface.fragments
        .filter((fragment: { type: string; }) => fragment.type === 'function')
        .map((fragment) => {
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
                        reason: canReplace.reason,
                    };
                }),
            };
        });

    return {
        contractAddress,
        functions,
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
    contractInterfaces: Map<string, Interface>,
    options: {
        validate?: boolean;
    } = {},
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
    const { validate = true } = options;

    // Get the replacement data
    const replacement = this.calculateReplacementData(
        contractAddress,
        functionName,
        parameterName,
        token,
        balanceAddress,
        contractInterfaces,
    );

    // Get function info for calculation details
    const contractInterface = contractInterfaces.get(contractAddress.toLowerCase());
    if (!contractInterface) {
        throw new Error(`Contract interface not found for address: ${contractAddress}`);
    }

    const functionFragment = contractInterface.getFunction(functionName);
    if (!functionFragment) {
        throw new Error(`Function '${functionName}' not found in contract interface for ${contractAddress}`);
    }

    const paramIndex = functionFragment.inputs.findIndex((input: { name: string; }) => input.name === parameterName);
    const param = functionFragment.inputs[paramIndex]!;

    const calculation = {
        functionSignature: functionFragment.format('full'),
        parameterInfo: {
            name: parameterName,
            type: param.type,
            index: paramIndex,
            position: replacement.position,
            length: replacement.len,
        },
        positionCalculation: `Position = 4 bytes (selector) + ${paramIndex} * 32 bytes = ${replacement.position} bytes`,
    };

    // Validation
    const validation = {
        isValid: true,
        warnings: [] as string[],
        suggestions: [] as string[],
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
        validation,
    };
}

/**
 * Private helper to calculate position and length for complex parameter types
 * @param inputs - The inputs of the function
 * @param targetIndex - The index of the parameter to calculate the position and length for
 * @returns The position and length of the parameter
 */
private _calculateParamPositionAndLength(
    inputs: readonly ethers.ParamType[],
    targetIndex: number,
): { position: number; len: number } {
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
    if (
        type.startsWith('uint') ||
        type.startsWith('int') ||
        type === 'address' ||
        type === 'bool' ||
        type.startsWith('bytes32')
    ) {
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
        reason: `is not suitable for balance replacement. Only uint/int types are supported.`,
    };
}
}