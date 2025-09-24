import { Interface } from 'ethers';

export class AbiHandler {
    public contractInterfaces: Map<string, Interface> = new Map();

    /**
     * Add a contract interface for encoding function calls
     * Supports both human-readable ABI strings and generated ABI JSON objects
     * @param address - The address of the contract to add interface for
     * @param abi - The abi of the contract to add interface for
     * @returns The sdk instance
     */
    public addContractInterface(address: string, abi: string | any[]): this {
        const parsedAbi = this._parseAbi(abi);
        this.contractInterfaces.set(address.toLowerCase(), new Interface(parsedAbi));
        return this;
    }
    /**
     * Parse ABI - handles both human-readable strings and generated ABI JSON objects
     * Extracts only function definitions from JSON ABI
     */
    private _parseAbi(abi: string | any[]): string[] {
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
        const params = func.inputs
            .map((input: any) => {
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
            })
            .join(', ');

        // Build return types if available
        let returnTypes = '';
        if (func.outputs && func.outputs.length > 0) {
            const outputs = func.outputs
                .map((output: any) => {
                    const outputType = output.type;
                    if (output.name) {
                        return `${outputType} ${output.name}`;
                    }
                    return outputType;
                })
                .join(', ');

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
}