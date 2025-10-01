import { ethers, Interface } from 'ethers';

import { AmountChange, HookType, ReplacementType } from '../../../src/agnosticSdk/AgnosticStructs';
import { HooksHandler } from '../../../src/agnosticSdk/HooksHandler';

describe('HooksHandler', () => {
    let hooksHandler: HooksHandler;
    let mockInterface: Interface;
    let contractInterfaces: Map<string, Interface>;

    const mockContractAddress = '0x1234567890123456789012345678901234567890';
    const mockTokenAddress = '0xabcdef1234567890123456789012345678901234';
    const mockSpenderAddress = '0x9876543210987654321098765432109876543210';

    beforeEach(() => {
        hooksHandler = new HooksHandler();
        
        // Create a mock interface with some test functions
        const testAbi = [
            'function transfer(address to, uint256 amount) external returns (bool)',
            'function approve(address spender, uint256 amount) external returns (bool)',
            'function balanceOf(address account) view external returns (uint256)',
            'function swap(uint256 amountIn, address tokenOut) external',
            'function deposit() payable external',
            'function complexFunction(uint256 param1, address param2, bool param3) external returns (uint256)'
        ];
        
        mockInterface = new Interface(testAbi);
        contractInterfaces = new Map();
        contractInterfaces.set(mockContractAddress.toLowerCase(), mockInterface);
    });

    describe('createCustomHook', () => {
        it('should create custom hook with default options', () => {
            const functionName = 'transfer';
            const params = [mockSpenderAddress, ethers.parseEther('100')];

            const hook = hooksHandler.createCustomHook(
                mockContractAddress,
                functionName,
                params,
                contractInterfaces
            );

            expect(hook.hookType).toBe(HookType.Custom);
            expect(hook.hookData).toBeDefined();
            
            // Decode and verify the hook data
            const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
                ['tuple(bool,address,uint256,bytes,bytes)'],
                hook.hookData
            )[0];
            
            expect(decoded[0]).toBe(true); // isFromSAPerspective default
            expect(decoded[1]).toBe(mockContractAddress); // contractAddress
            expect(decoded[2]).toBe(0n); // value default
            expect(decoded[3]).toBeDefined(); // encoded function data
            expect(decoded[4]).toBe('0x'); // improvedMissionInfo default
        });

        it('should create custom hook with custom options', () => {
            const functionName = 'deposit';
            const params: any[] = [];
            const options = {
                isFromSAPerspective: false,
                value: ethers.parseEther('1'),
                dynamicReplacements: undefined
            };

            const hook = hooksHandler.createCustomHook(
                mockContractAddress,
                functionName,
                params,
                contractInterfaces,
                options
            );

            expect(hook.hookType).toBe(HookType.Custom);
            
            const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
                ['tuple(bool,address,uint256,bytes,bytes)'],
                hook.hookData
            )[0];
            
            expect(decoded[0]).toBe(false); // isFromSAPerspective
            expect(decoded[1]).toBe(mockContractAddress);
            expect(decoded[2]).toBe(ethers.parseEther('1')); // value
            expect(decoded[4]).toBe('0x'); // no replacements
        });

        it('should create custom hook with dynamic replacements', () => {
            const functionName = 'swap';
            const params = [ethers.parseEther('100'), mockTokenAddress];
            const dynamicReplacements: AmountChange[] = [{
                position: 4,
                len: 32,
                token: mockTokenAddress,
                balanceAddress: mockContractAddress
            }];

            const hook = hooksHandler.createCustomHook(
                mockContractAddress,
                functionName,
                params,
                contractInterfaces,
                { dynamicReplacements }
            );

            expect(hook.hookType).toBe(HookType.Custom);
            
            const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
                ['tuple(bool,address,uint256,bytes,bytes)'],
                hook.hookData
            )[0];
            
            expect(decoded[0]).toBe(true); // default isFromSAPerspective
            expect(decoded[4]).not.toBe('0x'); // has improvedMissionInfo
            
            // Decode the improvedMissionInfo
            const [replacementType, replacementData] = ethers.AbiCoder.defaultAbiCoder().decode(
                ['uint8', 'bytes'],
                decoded[4]
            );
            
            expect(Number(replacementType)).toBe(ReplacementType.Amount);
            
            const [[position, len, token, balanceAddress]] = ethers.AbiCoder.defaultAbiCoder().decode(
                ['tuple(uint16,uint16,address,address)'],
                replacementData
            );
            
            expect(Number(position)).toBe(4);
            expect(Number(len)).toBe(32);
            expect(token.toLowerCase()).toBe(mockTokenAddress.toLowerCase());
            expect(balanceAddress.toLowerCase()).toBe(mockContractAddress.toLowerCase());
        });

        it('should create custom hook with multiple parameters', () => {
            const functionName = 'complexFunction';
            const params = [ethers.parseEther('50'), mockSpenderAddress, true];

            const hook = hooksHandler.createCustomHook(
                mockContractAddress,
                functionName,
                params,
                contractInterfaces
            );

            expect(hook.hookType).toBe(HookType.Custom);
            expect(hook.hookData).toBeDefined();
            
            const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
                ['tuple(bool,address,uint256,bytes,bytes)'],
                hook.hookData
            )[0];
            
            // Verify the function data was encoded correctly
            const expectedData = mockInterface.encodeFunctionData(functionName, params);
            expect(decoded[3]).toBe(expectedData);
        });

        it('should throw error when contract interface not found', () => {
            const unknownAddress = '0x0000000000000000000000000000000000000000';
            
            expect(() => {
                hooksHandler.createCustomHook(
                    unknownAddress,
                    'transfer',
                    [mockSpenderAddress, ethers.parseEther('100')],
                    contractInterfaces
                );
            }).toThrow(`Contract interface not found for address: ${unknownAddress}`);
        });

        it('should throw error when function not found in interface', () => {
            expect(() => {
                hooksHandler.createCustomHook(
                    mockContractAddress,
                    'nonExistentFunction',
                    [],
                    contractInterfaces
                );
            }).toThrow(); // Interface will throw when function not found
        });

        it('should handle empty parameters array', () => {
            const functionName = 'deposit';
            const params: any[] = [];

            const hook = hooksHandler.createCustomHook(
                mockContractAddress,
                functionName,
                params,
                contractInterfaces
            );

            expect(hook.hookType).toBe(HookType.Custom);
            expect(hook.hookData).toBeDefined();
        });

        it('should handle case-insensitive contract address', () => {
            const upperCaseAddress = mockContractAddress.toUpperCase();
            const functionName = 'transfer';
            const params = [mockSpenderAddress, ethers.parseEther('100')];

            // The interface map uses lowercase keys, so this should still work
            const hook = hooksHandler.createCustomHook(
                upperCaseAddress,
                functionName,
                params,
                contractInterfaces
            );

            expect(hook.hookType).toBe(HookType.Custom);
            expect(hook.hookData).toBeDefined();
            
            // Verify the contract address is correctly encoded (should be in checksum format)
            const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
                ['tuple(bool,address,uint256,bytes,bytes)'],
                hook.hookData
            )[0];
            
            expect(decoded[1].toLowerCase()).toBe(mockContractAddress.toLowerCase());
        });
    });

    describe('createFullBalanceApproveHook', () => {
        it('should create approve hook with default isFromSAPerspective', () => {
            const hook = hooksHandler.createFullBalanceApproveHook(
                mockTokenAddress,
                mockSpenderAddress
            );

            expect(hook.hookType).toBe(HookType.FullBalanceApprove);
            expect(hook.hookData).toBeDefined();
            
            const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
                ['tuple(address,address,bool)'],
                hook.hookData
            )[0];
            
            expect(decoded[0].toLowerCase()).toBe(mockTokenAddress.toLowerCase()); // token
            expect(decoded[1].toLowerCase()).toBe(mockSpenderAddress.toLowerCase()); // to
            expect(decoded[2]).toBe(true); // isFromSAPerspective default
        });

        it('should create approve hook with custom isFromSAPerspective', () => {
            const hook = hooksHandler.createFullBalanceApproveHook(
                mockTokenAddress,
                mockSpenderAddress,
                false
            );

            expect(hook.hookType).toBe(HookType.FullBalanceApprove);
            
            const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
                ['tuple(address,address,bool)'],
                hook.hookData
            )[0];
            
            expect(decoded[0].toLowerCase()).toBe(mockTokenAddress.toLowerCase());
            expect(decoded[1].toLowerCase()).toBe(mockSpenderAddress.toLowerCase());
            expect(decoded[2]).toBe(false); // isFromSAPerspective
        });

        it('should handle different token and spender addresses', () => {
            const differentToken = '0x1111111111111111111111111111111111111111';
            const differentSpender = '0x2222222222222222222222222222222222222222';
            
            const hook = hooksHandler.createFullBalanceApproveHook(
                differentToken,
                differentSpender,
                true
            );

            const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
                ['tuple(address,address,bool)'],
                hook.hookData
            )[0];
            
            expect(decoded[0]).toBe(differentToken);
            expect(decoded[1]).toBe(differentSpender);
            expect(decoded[2]).toBe(true);
        });
    });

    describe('createFullBalanceTransferHook', () => {
        it('should create transfer hook with default isFromSAPerspective', () => {
            const hook = hooksHandler.createFullBalanceTransferHook(
                mockTokenAddress,
                mockSpenderAddress
            );

            expect(hook.hookType).toBe(HookType.FullBalanceTransfer);
            expect(hook.hookData).toBeDefined();
            
            const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
                ['tuple(address,address,bool)'],
                hook.hookData
            )[0];
            
            expect(decoded[0].toLowerCase()).toBe(mockTokenAddress.toLowerCase()); // token
            expect(decoded[1].toLowerCase()).toBe(mockSpenderAddress.toLowerCase()); // to
            expect(decoded[2]).toBe(true); // isFromSAPerspective default
        });

        it('should create transfer hook with custom isFromSAPerspective', () => {
            const hook = hooksHandler.createFullBalanceTransferHook(
                mockTokenAddress,
                mockSpenderAddress,
                false
            );

            expect(hook.hookType).toBe(HookType.FullBalanceTransfer);
            
            const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
                ['tuple(address,address,bool)'],
                hook.hookData
            )[0];
            
            expect(decoded[0].toLowerCase()).toBe(mockTokenAddress.toLowerCase());
            expect(decoded[1].toLowerCase()).toBe(mockSpenderAddress.toLowerCase());
            expect(decoded[2]).toBe(false); // isFromSAPerspective
        });

        it('should handle different token and recipient addresses', () => {
            const differentToken = '0x3333333333333333333333333333333333333333';
            const differentRecipient = '0x4444444444444444444444444444444444444444';
            
            const hook = hooksHandler.createFullBalanceTransferHook(
                differentToken,
                differentRecipient,
                true
            );

            const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
                ['tuple(address,address,bool)'],
                hook.hookData
            )[0];
            
            expect(decoded[0]).toBe(differentToken);
            expect(decoded[1]).toBe(differentRecipient);
            expect(decoded[2]).toBe(true);
        });
    });

    describe('createMultipleApproves', () => {
        it('should create multiple approve hooks with default settings', () => {
            const approvals = [
                { token: '0x1111111111111111111111111111111111111111', spender: '0x2222222222222222222222222222222222222222' },
                { token: '0x3333333333333333333333333333333333333333', spender: '0x4444444444444444444444444444444444444444' }
            ];

            const hooks = hooksHandler.createMultipleApproves(approvals);

            expect(hooks).toHaveLength(2);
            
            hooks.forEach((hook, index) => {
                expect(hook.hookType).toBe(HookType.FullBalanceApprove);
                
                const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
                    ['tuple(address,address,bool)'],
                    hook.hookData
                )[0];
                
                expect(decoded[0]).toBe(approvals[index].token);
                expect(decoded[1]).toBe(approvals[index].spender);
                expect(decoded[2]).toBe(true); // default isFromSA
            });
        });

        it('should create multiple approve hooks with custom isFromSA settings', () => {
            const approvals = [
                { token: '0x1111111111111111111111111111111111111111', spender: '0x2222222222222222222222222222222222222222', isFromSA: false },
                { token: '0x3333333333333333333333333333333333333333', spender: '0x4444444444444444444444444444444444444444', isFromSA: true },
                { token: '0x5555555555555555555555555555555555555555', spender: '0x6666666666666666666666666666666666666666' } // no isFromSA, should default to true
            ];

            const hooks = hooksHandler.createMultipleApproves(approvals);

            expect(hooks).toHaveLength(3);
            
            const expectedIsFromSA = [false, true, true];
            
            hooks.forEach((hook, index) => {
                expect(hook.hookType).toBe(HookType.FullBalanceApprove);
                
                const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
                    ['tuple(address,address,bool)'],
                    hook.hookData
                )[0];
                
                expect(decoded[0]).toBe(approvals[index].token);
                expect(decoded[1]).toBe(approvals[index].spender);
                expect(decoded[2]).toBe(expectedIsFromSA[index]);
            });
        });

        it('should handle empty approvals array', () => {
            const hooks = hooksHandler.createMultipleApproves([]);
            
            expect(hooks).toHaveLength(0);
            expect(Array.isArray(hooks)).toBe(true);
        });

        it('should handle single approval', () => {
            const approvals = [
                { token: mockTokenAddress, spender: mockSpenderAddress, isFromSA: false }
            ];

            const hooks = hooksHandler.createMultipleApproves(approvals);

            expect(hooks).toHaveLength(1);
            expect(hooks[0].hookType).toBe(HookType.FullBalanceApprove);
            
            const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
                ['tuple(address,address,bool)'],
                hooks[0].hookData
            )[0];
            
            expect(decoded[0].toLowerCase()).toBe(mockTokenAddress.toLowerCase());
            expect(decoded[1].toLowerCase()).toBe(mockSpenderAddress.toLowerCase());
            expect(decoded[2]).toBe(false);
        });

        it('should handle mixed isFromSA values correctly', () => {
            const approvals = [
                { token: '0x1111111111111111111111111111111111111111', spender: '0x2222222222222222222222222222222222222222', isFromSA: true },
                { token: '0x3333333333333333333333333333333333333333', spender: '0x4444444444444444444444444444444444444444', isFromSA: false },
                { token: '0x5555555555555555555555555555555555555555', spender: '0x6666666666666666666666666666666666666666', isFromSA: undefined as any }
            ];

            const hooks = hooksHandler.createMultipleApproves(approvals);

            expect(hooks).toHaveLength(3);
            
            const decoded0 = ethers.AbiCoder.defaultAbiCoder().decode(['tuple(address,address,bool)'], hooks[0].hookData)[0];
            const decoded1 = ethers.AbiCoder.defaultAbiCoder().decode(['tuple(address,address,bool)'], hooks[1].hookData)[0];
            const decoded2 = ethers.AbiCoder.defaultAbiCoder().decode(['tuple(address,address,bool)'], hooks[2].hookData)[0];
            
            expect(decoded0[2]).toBe(true);
            expect(decoded1[2]).toBe(false);
            expect(decoded2[2]).toBe(true); // undefined should default to true
        });
    });

    describe('hook data encoding and decoding consistency', () => {
        it('should maintain data integrity for custom hooks', () => {
            const functionName = 'transfer';
            const params = [mockSpenderAddress, ethers.parseEther('123.456')];
            
            const hook = hooksHandler.createCustomHook(
                mockContractAddress,
                functionName,
                params,
                contractInterfaces,
                {
                    isFromSAPerspective: false,
                    value: ethers.parseEther('2'),
                    dynamicReplacements: [{
                        position: 36,
                        len: 32,
                        token: mockTokenAddress,
                        balanceAddress: mockSpenderAddress
                    }]
                }
            );
            
            const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
                ['tuple(bool,address,uint256,bytes,bytes)'],
                hook.hookData
            )[0];
            
            // Verify all fields are correctly encoded
            expect(decoded[0]).toBe(false); // isFromSAPerspective
            expect(decoded[1]).toBe(mockContractAddress); // contractAddress
            expect(decoded[2]).toBe(ethers.parseEther('2')); // value
            
            // Verify function call data
            const expectedFunctionData = mockInterface.encodeFunctionData(functionName, params);
            expect(decoded[3]).toBe(expectedFunctionData);
            
            // Verify replacement data
            expect(decoded[4]).not.toBe('0x');
            const [replacementType, replacementData] = ethers.AbiCoder.defaultAbiCoder().decode(
                ['uint8', 'bytes'],
                decoded[4]
            );
            expect(Number(replacementType)).toBe(ReplacementType.Amount);
            
            const [[position, len, token, balanceAddress]] = ethers.AbiCoder.defaultAbiCoder().decode(
                ['tuple(uint16,uint16,address,address)'],
                replacementData
            );
            expect(Number(position)).toBe(36);
            expect(Number(len)).toBe(32);
            expect(token.toLowerCase()).toBe(mockTokenAddress.toLowerCase());
            expect(balanceAddress.toLowerCase()).toBe(mockSpenderAddress.toLowerCase());
        });

        it('should maintain data integrity for approve hooks', () => {
            const token = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1';
            const spender = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2';
            
            const hook = hooksHandler.createFullBalanceApproveHook(token, spender, false);
            
            const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
                ['tuple(address,address,bool)'],
                hook.hookData
            )[0];
            
            expect(decoded[0].toLowerCase()).toBe(token.toLowerCase());
            expect(decoded[1].toLowerCase()).toBe(spender.toLowerCase());
            expect(decoded[2]).toBe(false);
        });

        it('should maintain data integrity for transfer hooks', () => {
            const token = '0xccccccccccccccccccccccccccccccccccccccc3';
            const recipient = '0xddddddddddddddddddddddddddddddddddddddd4';
            
            const hook = hooksHandler.createFullBalanceTransferHook(token, recipient, true);
            
            const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
                ['tuple(address,address,bool)'],
                hook.hookData
            )[0];
            
            expect(decoded[0].toLowerCase()).toBe(token.toLowerCase());
            expect(decoded[1].toLowerCase()).toBe(recipient.toLowerCase());
            expect(decoded[2]).toBe(true);
        });
    });

    describe('edge cases and error handling', () => {
        it('should handle very large parameter values in custom hooks', () => {
            const functionName = 'transfer';
            const largeAmount = ethers.parseEther('999999999999999999999');
            const params = [mockSpenderAddress, largeAmount];
            
            const hook = hooksHandler.createCustomHook(
                mockContractAddress,
                functionName,
                params,
                contractInterfaces
            );
            
            expect(hook.hookType).toBe(HookType.Custom);
            expect(hook.hookData).toBeDefined();
        });

        it('should handle zero values correctly', () => {
            const functionName = 'transfer';
            const params = [mockSpenderAddress, 0n];
            
            const hook = hooksHandler.createCustomHook(
                mockContractAddress,
                functionName,
                params,
                contractInterfaces,
                { value: 0n }
            );
            
            const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
                ['tuple(bool,address,uint256,bytes,bytes)'],
                hook.hookData
            )[0];
            
            expect(decoded[2]).toBe(0n); // value should be 0
        });

        it('should handle multiple dynamic replacements (first one only)', () => {
            const functionName = 'complexFunction';
            const params = [ethers.parseEther('100'), mockSpenderAddress, true];
            const multipleReplacements: AmountChange[] = [
                {
                    position: 4,
                    len: 32,
                    token: mockTokenAddress,
                    balanceAddress: mockContractAddress
                },
                {
                    position: 36,
                    len: 32,
                    token: mockSpenderAddress,
                    balanceAddress: mockTokenAddress
                }
            ];

            const hook = hooksHandler.createCustomHook(
                mockContractAddress,
                functionName,
                params,
                contractInterfaces,
                { dynamicReplacements: multipleReplacements }
            );

            // Should only use the first replacement
            const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
                ['tuple(bool,address,uint256,bytes,bytes)'],
                hook.hookData
            )[0];
            
            const [replacementType, replacementData] = ethers.AbiCoder.defaultAbiCoder().decode(
                ['uint8', 'bytes'],
                decoded[4]
            );
            
            const [[position, len, token, balanceAddress]] = ethers.AbiCoder.defaultAbiCoder().decode(
                ['tuple(uint16,uint16,address,address)'],
                replacementData
            );
            
            // Should match the first replacement only
            expect(Number(position)).toBe(4);
            expect(Number(len)).toBe(32);
            expect(token.toLowerCase()).toBe(mockTokenAddress.toLowerCase());
            expect(balanceAddress.toLowerCase()).toBe(mockContractAddress.toLowerCase());
        });
    });
});