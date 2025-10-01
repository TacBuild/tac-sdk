import { Interface } from 'ethers';

import { AbiHandler } from '../../../src/agnosticSdk/AbiHandler';

describe('AbiHandler', () => {
    let abiHandler: AbiHandler;

    beforeEach(() => {
        abiHandler = new AbiHandler();
    });

    describe('addContractInterface', () => {
        it('should add interface for human-readable ABI strings', () => {
            const address = '0x1234567890123456789012345678901234567890';
            const humanReadableAbi = [
                'function transfer(address to, uint256 amount) external returns (bool)',
                'function balanceOf(address account) view external returns (uint256)',
            ];

            const result = abiHandler.addContractInterface(address, humanReadableAbi);

            expect(result).toBe(abiHandler); // Should return this for chaining
            expect(abiHandler.contractInterfaces.has(address.toLowerCase())).toBe(true);
            
            const storedInterface = abiHandler.contractInterfaces.get(address.toLowerCase());
            expect(storedInterface).toBeInstanceOf(Interface);
        });

        it('should add interface for JSON ABI format', () => {
            const address = '0xABCDEF1234567890123456789012345678901234';
            const jsonAbi = [
                {
                    type: 'function',
                    name: 'transfer',
                    inputs: [
                        { name: 'to', type: 'address' },
                        { name: 'amount', type: 'uint256' }
                    ],
                    outputs: [{ name: '', type: 'bool' }],
                    stateMutability: 'nonpayable'
                },
                {
                    type: 'function',
                    name: 'balanceOf',
                    inputs: [{ name: 'account', type: 'address' }],
                    outputs: [{ name: '', type: 'uint256' }],
                    stateMutability: 'view'
                }
            ];

            abiHandler.addContractInterface(address, jsonAbi);

            expect(abiHandler.contractInterfaces.has(address.toLowerCase())).toBe(true);
        });

        it('should handle mixed ABI formats', () => {
            const address = '0xMIXED123456789012345678901234567890';
            const mixedAbi = [
                'function simple() external',
                {
                    type: 'function',
                    name: 'complex',
                    inputs: [{ name: 'param', type: 'uint256' }],
                    outputs: [{ name: '', type: 'bool' }],
                    stateMutability: 'payable'
                }
            ];

            abiHandler.addContractInterface(address, mixedAbi);

            expect(abiHandler.contractInterfaces.has(address.toLowerCase())).toBe(true);
        });

        it('should convert address to lowercase for storage', () => {
            const upperAddress = '0xABCDEF1234567890123456789012345678901234';
            const lowerAddress = upperAddress.toLowerCase();
            
            abiHandler.addContractInterface(upperAddress, ['function test() external']);

            expect(abiHandler.contractInterfaces.has(lowerAddress)).toBe(true);
            expect(abiHandler.contractInterfaces.has(upperAddress)).toBe(false);
        });
    });

    describe('_parseAbi functionality through addContractInterface', () => {
        it('should handle function with view state mutability', () => {
            const jsonAbi = [{
                type: 'function',
                name: 'getValue',
                inputs: [],
                outputs: [{ name: '', type: 'uint256' }],
                stateMutability: 'view'
            }];

            expect(() => {
                abiHandler.addContractInterface('0x123', jsonAbi);
            }).not.toThrow();
        });

        it('should handle function with pure state mutability', () => {
            const jsonAbi = [{
                type: 'function',
                name: 'calculate',
                inputs: [{ name: 'a', type: 'uint256' }, { name: 'b', type: 'uint256' }],
                outputs: [{ name: '', type: 'uint256' }],
                stateMutability: 'pure'
            }];

            expect(() => {
                abiHandler.addContractInterface('0x124', jsonAbi);
            }).not.toThrow();
        });

        it('should handle function with payable state mutability', () => {
            const jsonAbi = [{
                type: 'function',
                name: 'deposit',
                inputs: [],
                outputs: [],
                stateMutability: 'payable'
            }];

            expect(() => {
                abiHandler.addContractInterface('0x125', jsonAbi);
            }).not.toThrow();
        });

        it('should handle function with nonpayable state mutability', () => {
            const jsonAbi = [{
                type: 'function',
                name: 'setValue',
                inputs: [{ name: 'value', type: 'uint256' }],
                outputs: [],
                stateMutability: 'nonpayable'
            }];

            expect(() => {
                abiHandler.addContractInterface('0x126', jsonAbi);
            }).not.toThrow();
        });

        it('should skip non-function ABI items', () => {
            const jsonAbi = [
                { type: 'event', name: 'Transfer', inputs: [] },
                { type: 'error', name: 'InsufficientBalance', inputs: [] },
                { type: 'constructor', inputs: [] },
                {
                    type: 'function',
                    name: 'transfer',
                    inputs: [{ name: 'to', type: 'address' }],
                    outputs: [],
                    stateMutability: 'nonpayable'
                }
            ];

            expect(() => {
                abiHandler.addContractInterface('0x127', jsonAbi);
            }).not.toThrow();

            // Should only process the function, not events/errors/constructor
            expect(abiHandler.contractInterfaces.has('0x127')).toBe(true);
        });
    });

    describe('_buildFunctionSignature functionality', () => {
        it('should handle function without parameters', () => {
            const jsonAbi = [{
                type: 'function',
                name: 'getCount',
                inputs: [],
                outputs: [{ name: '', type: 'uint256' }],
                stateMutability: 'view'
            }];

            expect(() => {
                abiHandler.addContractInterface('0x200', jsonAbi);
            }).not.toThrow();
        });

        it('should handle function without return values', () => {
            const jsonAbi = [{
                type: 'function',
                name: 'reset',
                inputs: [],
                outputs: [],
                stateMutability: 'nonpayable'
            }];

            expect(() => {
                abiHandler.addContractInterface('0x201', jsonAbi);
            }).not.toThrow();
        });

        it('should handle function with multiple parameters and return values', () => {
            const jsonAbi = [{
                type: 'function',
                name: 'multiReturn',
                inputs: [
                    { name: 'param1', type: 'uint256' },
                    { name: 'param2', type: 'address' }
                ],
                outputs: [
                    { name: 'result1', type: 'bool' },
                    { name: 'result2', type: 'uint256' }
                ],
                stateMutability: 'view'
            }];

            expect(() => {
                abiHandler.addContractInterface('0x202', jsonAbi);
            }).not.toThrow();
        });

        it('should handle function with missing name', () => {
            const jsonAbi = [{
                type: 'function',
                inputs: [{ name: 'param', type: 'uint256' }],
                outputs: [],
                stateMutability: 'nonpayable'
            }];

            expect(() => {
                abiHandler.addContractInterface('0x203', jsonAbi);
            }).not.toThrow();
        });

        it('should handle function with non-array inputs', () => {
            const jsonAbi = [{
                type: 'function',
                name: 'badInputs',
                inputs: 'not an array',
                outputs: [],
                stateMutability: 'nonpayable'
            }];

            expect(() => {
                abiHandler.addContractInterface('0x204', jsonAbi);
            }).not.toThrow();
        });
    });

    describe('_buildParameterType functionality', () => {
        it('should handle tuple types', () => {
            const jsonAbi = [{
                type: 'function',
                name: 'processStruct',
                inputs: [{
                    name: 'data',
                    type: 'tuple',
                    components: [
                        { name: 'id', type: 'uint256' },
                        { name: 'owner', type: 'address' },
                        { name: 'active', type: 'bool' }
                    ]
                }],
                outputs: [],
                stateMutability: 'nonpayable'
            }];

            expect(() => {
                abiHandler.addContractInterface('0x300', jsonAbi);
            }).not.toThrow();
        });

        it('should handle tuple array types', () => {
            const jsonAbi = [{
                type: 'function',
                name: 'processStructArray',
                inputs: [{
                    name: 'dataArray',
                    type: 'tuple[]',
                    components: [
                        { name: 'id', type: 'uint256' },
                        { name: 'value', type: 'string' }
                    ]
                }],
                outputs: [],
                stateMutability: 'nonpayable'
            }];

            expect(() => {
                abiHandler.addContractInterface('0x301', jsonAbi);
            }).not.toThrow();
        });

        it('should handle nested tuple types', () => {
            const jsonAbi = [{
                type: 'function',
                name: 'processNestedStruct',
                inputs: [{
                    name: 'nested',
                    type: 'tuple',
                    components: [
                        { name: 'id', type: 'uint256' },
                        {
                            name: 'inner',
                            type: 'tuple',
                            components: [
                                { name: 'x', type: 'uint256' },
                                { name: 'y', type: 'uint256' }
                            ]
                        }
                    ]
                }],
                outputs: [],
                stateMutability: 'nonpayable'
            }];

            expect(() => {
                abiHandler.addContractInterface('0x302', jsonAbi);
            }).not.toThrow();
        });

        it('should handle tuple without components', () => {
            const jsonAbi = [{
                type: 'function',
                name: 'badTuple',
                inputs: [{
                    name: 'data',
                    type: 'tuple'
                    // missing components
                }],
                outputs: [],
                stateMutability: 'nonpayable'
            }];

            expect(() => {
                abiHandler.addContractInterface('0x303', jsonAbi);
            }).not.toThrow();
        });

        it('should handle tuple[] without components', () => {
            const jsonAbi = [{
                type: 'function',
                name: 'badTupleArray',
                inputs: [{
                    name: 'dataArray',
                    type: 'tuple[]'
                    // missing components
                }],
                outputs: [],
                stateMutability: 'nonpayable'
            }];

            expect(() => {
                abiHandler.addContractInterface('0x304', jsonAbi);
            }).not.toThrow();
        });

        it('should handle regular array types', () => {
            const jsonAbi = [{
                type: 'function',
                name: 'processArrays',
                inputs: [
                    { name: 'numbers', type: 'uint256[]' },
                    { name: 'addresses', type: 'address[]' },
                    { name: 'flags', type: 'bool[]' }
                ],
                outputs: [],
                stateMutability: 'nonpayable'
            }];

            expect(() => {
                abiHandler.addContractInterface('0x305', jsonAbi);
            }).not.toThrow();
        });

        it('should handle parameters without names', () => {
            const jsonAbi = [{
                type: 'function',
                name: 'unnamedParams',
                inputs: [
                    { type: 'uint256' },
                    { type: 'address' }
                ],
                outputs: [
                    { type: 'bool' }
                ],
                stateMutability: 'view'
            }];

            expect(() => {
                abiHandler.addContractInterface('0x306', jsonAbi);
            }).not.toThrow();
        });

        it('should handle components without names in tuples', () => {
            const jsonAbi = [{
                type: 'function',
                name: 'unnamedComponents',
                inputs: [{
                    name: 'data',
                    type: 'tuple',
                    components: [
                        { type: 'uint256' },
                        { type: 'address' }
                    ]
                }],
                outputs: [],
                stateMutability: 'nonpayable'
            }];

            expect(() => {
                abiHandler.addContractInterface('0x307', jsonAbi);
            }).not.toThrow();
        });
    });

    describe('contract interfaces storage', () => {
        it('should maintain separate interfaces for different addresses', () => {
            const abi1 = ['function method1() external'];
            const abi2 = ['function method2() external'];
            
            abiHandler.addContractInterface('0x111', abi1);
            abiHandler.addContractInterface('0x222', abi2);

            expect(abiHandler.contractInterfaces.size).toBe(2);
            expect(abiHandler.contractInterfaces.has('0x111')).toBe(true);
            expect(abiHandler.contractInterfaces.has('0x222')).toBe(true);
        });

        it('should replace interface when adding same address twice', () => {
            const abi1 = ['function old() external'];
            const abi2 = ['function new() external'];
            
            abiHandler.addContractInterface('0x333', abi1);
            abiHandler.addContractInterface('0x333', abi2);

            expect(abiHandler.contractInterfaces.size).toBe(1);
            expect(abiHandler.contractInterfaces.has('0x333')).toBe(true);
        });
    });
});