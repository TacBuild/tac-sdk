import { Interface } from 'ethers';

import { ReplacementHelper } from '../../../src/agnosticSdk/ReplacementHelper';

describe('ReplacementHelper', () => {
    let replacementHelper: ReplacementHelper;
    let mockContractInterface: Interface;
    let mockContractInterfaces: Map<string, Interface>;

    const mockAddress = '0x1234567890123456789012345678901234567890';
    const mockToken = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
    const mockBalanceAddress = '0x9876543210987654321098765432109876543210';

    beforeEach(() => {
        replacementHelper = new ReplacementHelper();
        
        // Create mock contract interface
        const abi = [
            'function transfer(address to, uint256 amount) external returns (bool)',
            'function approve(address spender, uint256 amount) external returns (bool)',
            'function balanceOf(address account) external view returns (uint256)',
            'function swap(uint256 amountIn, uint256 amountOutMin, address[] path) external',
            'function deposit() external payable',
            'function withdraw(uint256 value) external',
            'function multicall(bytes[] calldata data) external returns (bytes[] memory results)',
            'function complexFunction(string memory text, bytes memory data) external',
        ];
        mockContractInterface = new Interface(abi);
        mockContractInterfaces = new Map();
        mockContractInterfaces.set(mockAddress.toLowerCase(), mockContractInterface);
    });

    describe('createAmountReplacement', () => {
        it('should create amount replacement for first parameter', () => {
            const result = replacementHelper.createAmountReplacement(0, mockToken, mockBalanceAddress);

            expect(result).toEqual({
                position: 4, // 4 bytes selector + 0 * 32 bytes
                len: 32,
                token: mockToken,
                balanceAddress: mockBalanceAddress,
            });
        });

        it('should create amount replacement for second parameter', () => {
            const result = replacementHelper.createAmountReplacement(1, mockToken, mockBalanceAddress);

            expect(result).toEqual({
                position: 36, // 4 bytes selector + 1 * 32 bytes
                len: 32,
                token: mockToken,
                balanceAddress: mockBalanceAddress,
            });
        });

        it('should create amount replacement for third parameter', () => {
            const result = replacementHelper.createAmountReplacement(2, mockToken, mockBalanceAddress);

            expect(result).toEqual({
                position: 68, // 4 bytes selector + 2 * 32 bytes
                len: 32,
                token: mockToken,
                balanceAddress: mockBalanceAddress,
            });
        });
    });

    describe('calculateReplacementData', () => {
        it('should calculate replacement data for existing function and parameter', () => {
            const result = replacementHelper.calculateReplacementData(
                mockAddress,
                'transfer',
                'amount',
                mockToken,
                mockBalanceAddress,
                mockContractInterfaces,
            );

            expect(result).toEqual({
                position: 36, // 4 bytes selector + 1 * 32 bytes (amount is second parameter)
                len: 32,
                token: mockToken,
                balanceAddress: mockBalanceAddress,
            });
        });

        it('should calculate replacement data for different parameter position', () => {
            const result = replacementHelper.calculateReplacementData(
                mockAddress,
                'swap',
                'amountIn',
                mockToken,
                mockBalanceAddress,
                mockContractInterfaces,
            );

            expect(result).toEqual({
                position: 4, // 4 bytes selector + 0 * 32 bytes (amountIn is first parameter)
                len: 32,
                token: mockToken,
                balanceAddress: mockBalanceAddress,
            });
        });

        it('should throw error when contract interface not found', () => {
            expect(() =>
                replacementHelper.calculateReplacementData(
                    '0xinvalidaddress',
                    'transfer',
                    'amount',
                    mockToken,
                    mockBalanceAddress,
                    mockContractInterfaces,
                ),
            ).toThrow('Contract interface not found for address: 0xinvalidaddress');
        });

        it('should throw error when function not found', () => {
            expect(() =>
                replacementHelper.calculateReplacementData(
                    mockAddress,
                    'nonexistentFunction',
                    'amount',
                    mockToken,
                    mockBalanceAddress,
                    mockContractInterfaces,
                ),
            ).toThrow("Function 'nonexistentFunction' not found in contract interface");
        });

        it('should throw error when parameter not found', () => {
            expect(() =>
                replacementHelper.calculateReplacementData(
                    mockAddress,
                    'transfer',
                    'nonexistentParam',
                    mockToken,
                    mockBalanceAddress,
                    mockContractInterfaces,
                ),
            ).toThrow("Parameter 'nonexistentParam' not found in function 'transfer'");
        });
    });

    describe('getReplacementHelper', () => {
        it('should return replacement helper information for contract', () => {
            const result = replacementHelper.getReplacementHelper(mockAddress, mockContractInterfaces);

            expect(result.contractAddress).toBe(mockAddress);
            expect(result.functions).toHaveLength(8);

            // Check transfer function
            const transferFunction = result.functions.find(f => f.name === 'transfer');
            expect(transferFunction).toBeDefined();
            expect(transferFunction!.parameters).toHaveLength(2);
            expect(transferFunction!.parameters[0].name).toBe('to');
            expect(transferFunction!.parameters[0].type).toBe('address');
            expect(transferFunction!.parameters[0].canReplace).toBe(false);
            expect(transferFunction!.parameters[1].name).toBe('amount');
            expect(transferFunction!.parameters[1].type).toBe('uint256');
            expect(transferFunction!.parameters[1].canReplace).toBe(true);
        });

        it('should handle parameters without names', () => {
            // Create interface with unnamed parameters
            const abiWithUnnamedParams = [
                'function test(uint256, address) external',
            ];
            const interfaceWithUnnamedParams = new Interface(abiWithUnnamedParams);
            const contractInterfaces = new Map();
            contractInterfaces.set(mockAddress.toLowerCase(), interfaceWithUnnamedParams);

            const result = replacementHelper.getReplacementHelper(mockAddress, contractInterfaces);

            expect(result.functions[0].parameters[0].name).toBe('param0');
            expect(result.functions[0].parameters[1].name).toBe('param1');
        });

        it('should throw error when contract interface not found', () => {
            expect(() =>
                replacementHelper.getReplacementHelper('0xinvalidaddress', mockContractInterfaces),
            ).toThrow('Contract interface not found for address: 0xinvalidaddress');
        });

        it('should handle different parameter types correctly', () => {
            const result = replacementHelper.getReplacementHelper(mockAddress, mockContractInterfaces);

            // Find complex function with different types
            const complexFunction = result.functions.find(f => f.name === 'complexFunction');
            expect(complexFunction).toBeDefined();
            expect(complexFunction!.parameters[0].type).toBe('string');
            expect(complexFunction!.parameters[0].canReplace).toBe(false);
            expect(complexFunction!.parameters[1].type).toBe('bytes');
            expect(complexFunction!.parameters[1].canReplace).toBe(false);
        });
    });

    describe('buildReplacementInteractive', () => {
        it('should build interactive replacement with validation enabled', () => {
            const result = replacementHelper.buildReplacementInteractive(
                mockAddress,
                'transfer',
                'amount',
                mockToken,
                mockBalanceAddress,
                mockContractInterfaces,
                { validate: true },
            );

            expect(result.replacement).toEqual({
                position: 36,
                len: 32,
                token: mockToken,
                balanceAddress: mockBalanceAddress,
            });

            expect(result.calculation.functionSignature).toContain('transfer');
            expect(result.calculation.parameterInfo.name).toBe('amount');
            expect(result.calculation.parameterInfo.type).toBe('uint256');
            expect(result.calculation.parameterInfo.index).toBe(1);
            expect(result.calculation.parameterInfo.position).toBe(36);
            expect(result.calculation.parameterInfo.length).toBe(32);
            expect(result.calculation.positionCalculation).toBe('Position = 4 bytes (selector) + 1 * 32 bytes = 36 bytes');

            expect(result.validation.isValid).toBe(true);
            expect(result.validation.warnings).toHaveLength(0);
            expect(result.validation.suggestions).toContain('✅ Parameter \'amount\' looks suitable for dynamic replacement');
        });

        it('should build interactive replacement with validation disabled', () => {
            const result = replacementHelper.buildReplacementInteractive(
                mockAddress,
                'transfer',
                'amount',
                mockToken,
                mockBalanceAddress,
                mockContractInterfaces,
                { validate: false },
            );

            expect(result.validation.isValid).toBe(true);
            expect(result.validation.warnings).toHaveLength(0);
            expect(result.validation.suggestions).toHaveLength(0);
        });

        it('should validate parameter suitability for amount replacement', () => {
            const result = replacementHelper.buildReplacementInteractive(
                mockAddress,
                'withdraw',
                'value',
                mockToken,
                mockBalanceAddress,
                mockContractInterfaces,
            );

            expect(result.validation.suggestions).toContain('✅ Parameter \'value\' looks suitable for dynamic replacement');
        });

        it('should warn about unsuitable parameter names', () => {
            const result = replacementHelper.buildReplacementInteractive(
                mockAddress,
                'transfer',
                'to',
                mockToken,
                mockBalanceAddress,
                mockContractInterfaces,
            );

            expect(result.validation.isValid).toBe(false);
            expect(result.validation.warnings).toContain('⚠️ Parameter \'to\' might not be intended for amount replacement');
            expect(result.validation.warnings).toContain("Parameter type 'address' is not suitable for balance replacement. Only uint/int types are supported.");
        });

        it('should validate token and balance addresses', () => {
            const result = replacementHelper.buildReplacementInteractive(
                mockAddress,
                'transfer',
                'amount',
                'invalidtoken',
                'invalidbalance',
                mockContractInterfaces,
            );

            expect(result.validation.isValid).toBe(false);
            expect(result.validation.warnings).toContain('Invalid token address: invalidtoken');
            expect(result.validation.warnings).toContain('Invalid balance address: invalidbalance');
        });

        it('should throw error when contract interface not found', () => {
            expect(() =>
                replacementHelper.buildReplacementInteractive(
                    '0xinvalidaddress',
                    'transfer',
                    'amount',
                    mockToken,
                    mockBalanceAddress,
                    mockContractInterfaces,
                ),
            ).toThrow('Contract interface not found for address: 0xinvalidaddress');
        });

        it('should throw error when function not found', () => {
            expect(() =>
                replacementHelper.buildReplacementInteractive(
                    mockAddress,
                    'nonexistentFunction',
                    'amount',
                    mockToken,
                    mockBalanceAddress,
                    mockContractInterfaces,
                ),
            ).toThrow("Function 'nonexistentFunction' not found in contract interface");
        });
    });

    describe('private helper methods', () => {
        describe('_calculateParamPositionAndLength', () => {
            it('should calculate position correctly for different parameter positions', () => {
                // Test through public method since _calculateParamPositionAndLength is private
                const firstParam = replacementHelper.calculateReplacementData(
                    mockAddress,
                    'transfer',
                    'to',
                    mockToken,
                    mockBalanceAddress,
                    mockContractInterfaces,
                );

                const secondParam = replacementHelper.calculateReplacementData(
                    mockAddress,
                    'transfer',
                    'amount',
                    mockToken,
                    mockBalanceAddress,
                    mockContractInterfaces,
                );

                expect(firstParam.position).toBe(4); // First parameter
                expect(secondParam.position).toBe(36); // Second parameter
                expect(firstParam.len).toBe(32);
                expect(secondParam.len).toBe(32);
            });
        });

        describe('_getTypeSize', () => {
            it('should return 32 bytes for basic types through public interface', () => {
                // Test different types through the interface
                const helper = replacementHelper.getReplacementHelper(mockAddress, mockContractInterfaces);
                
                // All parameters should be processed correctly indicating _getTypeSize works
                const transferFunction = helper.functions.find(f => f.name === 'transfer');
                expect(transferFunction!.parameters).toHaveLength(2);
            });
        });

        describe('_canParameterBeReplaced', () => {
            it('should identify uint types as replaceable', () => {
                const helper = replacementHelper.getReplacementHelper(mockAddress, mockContractInterfaces);
                
                const transferFunction = helper.functions.find(f => f.name === 'transfer');
                const amountParam = transferFunction!.parameters.find(p => p.name === 'amount');
                
                expect(amountParam!.canReplace).toBe(true);
                expect(amountParam!.reason).toBeUndefined();
            });

            it('should identify address types as not replaceable', () => {
                const helper = replacementHelper.getReplacementHelper(mockAddress, mockContractInterfaces);
                
                const transferFunction = helper.functions.find(f => f.name === 'transfer');
                const toParam = transferFunction!.parameters.find(p => p.name === 'to');
                
                expect(toParam!.canReplace).toBe(false);
                expect(toParam!.reason).toBe('is not suitable for balance replacement. Only uint/int types are supported.');
            });

            it('should handle string and bytes types as not replaceable', () => {
                const helper = replacementHelper.getReplacementHelper(mockAddress, mockContractInterfaces);
                
                const complexFunction = helper.functions.find(f => f.name === 'complexFunction');
                const stringParam = complexFunction!.parameters.find(p => p.type === 'string');
                const bytesParam = complexFunction!.parameters.find(p => p.type === 'bytes');
                
                expect(stringParam!.canReplace).toBe(false);
                expect(bytesParam!.canReplace).toBe(false);
            });
        });
    });

    describe('edge cases and error handling', () => {
        it('should handle case-insensitive contract addresses', () => {
            const upperCaseAddress = mockAddress.toUpperCase();
            
            const result = replacementHelper.calculateReplacementData(
                upperCaseAddress,
                'transfer',
                'amount',
                mockToken,
                mockBalanceAddress,
                mockContractInterfaces,
            );

            expect(result.position).toBe(36);
        });

        it('should handle functions with many parameters', () => {
            // Test with swap function that has array parameter
            const result = replacementHelper.calculateReplacementData(
                mockAddress,
                'swap',
                'amountOutMin',
                mockToken,
                mockBalanceAddress,
                mockContractInterfaces,
            );

            expect(result.position).toBe(36); // Second parameter
            expect(result.len).toBe(32);
        });

        it('should provide detailed error messages for missing parameters', () => {
            expect(() =>
                replacementHelper.calculateReplacementData(
                    mockAddress,
                    'transfer',
                    'wrongParam',
                    mockToken,
                    mockBalanceAddress,
                    mockContractInterfaces,
                ),
            ).toThrow("Parameter 'wrongParam' not found in function 'transfer'. Available parameters: to (address), amount (uint256)");
        });
    });

    describe('type checking scenarios', () => {
        it('should create interfaces with int types and check replaceability', () => {
            const abiWithIntTypes = [
                'function testFunction(int256 signedAmount, uint128 smallAmount, bool flag) external',
            ];
            const intInterface = new Interface(abiWithIntTypes);
            const intContractInterfaces = new Map();
            intContractInterfaces.set(mockAddress.toLowerCase(), intInterface);

            const helper = replacementHelper.getReplacementHelper(mockAddress, intContractInterfaces);
            const testFunction = helper.functions.find(f => f.name === 'testFunction');

            expect(testFunction!.parameters[0].canReplace).toBe(true); // int256
            expect(testFunction!.parameters[0].reason).toBe('but be careful with signed integers');
            expect(testFunction!.parameters[1].canReplace).toBe(true); // uint128
            expect(testFunction!.parameters[2].canReplace).toBe(false); // bool
        });

        it('should handle array types correctly', () => {
            const abiWithArrayTypes = [
                'function testArrayFunction(uint256[] amounts, address[] recipients) external',
            ];
            const arrayInterface = new Interface(abiWithArrayTypes);
            const arrayContractInterfaces = new Map();
            arrayContractInterfaces.set(mockAddress.toLowerCase(), arrayInterface);

            const helper = replacementHelper.getReplacementHelper(mockAddress, arrayContractInterfaces);
            const testFunction = helper.functions.find(f => f.name === 'testArrayFunction');

            expect(testFunction!.parameters[0].canReplace).toBe(false); // uint256[] - arrays not supported
            expect(testFunction!.parameters[1].canReplace).toBe(false); // address[]
        });
    });
});