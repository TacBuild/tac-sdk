import { Interface } from 'ethers';

import { Hook, HookType, NFTData, ZapCall } from '../../../src/agnosticSdk/AgnosticStructs';
import { DebugHelpers } from '../../../src/agnosticSdk/DebugHelpers';

describe('DebugHelpers', () => {
    let debugHelpers: DebugHelpers;
    let mockContractInterface: Interface;
    let mockContractInterfaces: Map<string, Interface>;

    const mockAddress1 = '0x1234567890123456789012345678901234567890';
    const mockAddress2 = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

    beforeEach(() => {
        debugHelpers = new DebugHelpers();
        
        // Create mock contract interface
        const abi = [
            'function transfer(address to, uint256 amount) external returns (bool)',
            'function approve(address spender, uint256 amount) external returns (bool)',
            'function balanceOf(address account) external view returns (uint256)',
        ];
        mockContractInterface = new Interface(abi);
        mockContractInterfaces = new Map();
        mockContractInterfaces.set(mockAddress1.toLowerCase(), mockContractInterface);

        // Mock console.log to avoid output during tests
        jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('buildZapCall', () => {
        it('should build ZapCall with hooks only', () => {
            const hooks: Hook[] = [
                { hookType: HookType.Custom, hookData: '0x1234' },
            ];

            const result = debugHelpers.buildZapCall(hooks);

            expect(result).toEqual({
                hooks,
                bridgeData: {
                    tokens: [],
                    nfts: [],
                    isRequired: false,
                },
            });
        });

        it('should build ZapCall with bridge tokens', () => {
            const hooks: Hook[] = [];
            const bridgeTokens = [mockAddress1];

            const result = debugHelpers.buildZapCall(hooks, bridgeTokens);

            expect(result.bridgeData.tokens).toEqual(bridgeTokens);
            expect(result.bridgeData.isRequired).toBe(true);
        });

        it('should build ZapCall with bridge NFTs', () => {
            const hooks: Hook[] = [];
            const bridgeNFTs: NFTData[] = [
                { nft: mockAddress1, id: 1n, amount: 1n },
            ];

            const result = debugHelpers.buildZapCall(hooks, [], bridgeNFTs);

            expect(result.bridgeData.nfts).toEqual(bridgeNFTs);
            expect(result.bridgeData.isRequired).toBe(true);
        });

        it('should build ZapCall with both tokens and NFTs', () => {
            const hooks: Hook[] = [];
            const bridgeTokens = [mockAddress1];
            const bridgeNFTs: NFTData[] = [
                { nft: mockAddress2, id: 5n, amount: 2n },
            ];

            const result = debugHelpers.buildZapCall(hooks, bridgeTokens, bridgeNFTs);

            expect(result.bridgeData.tokens).toEqual(bridgeTokens);
            expect(result.bridgeData.nfts).toEqual(bridgeNFTs);
            expect(result.bridgeData.isRequired).toBe(true);
        });
    });

    describe('decodeHookData', () => {
        it('should decode Custom hook data', () => {
            // Create encoded Custom hook data
            const customData = [
                true, // isFromSAPerspective
                mockAddress1, // contractAddress
                100n, // value
                '0x1234abcd', // data
                '0x5678abcd', // improvedMissionInfo
            ];
            const encoded = new Interface(['function dummy(tuple(bool,address,uint256,bytes,bytes))'])
                .encodeFunctionData('dummy', [customData]);
            const hookData = encoded.slice(10); // Remove selector

            const hook: Hook = {
                hookType: HookType.Custom,
                hookData: `0x${hookData}`,
            };

            const result = debugHelpers.decodeHookData(hook);

            expect(result[0]).toBe(true);
            expect(result[1]).toBe(mockAddress1);
            expect(result[2]).toBe(100n);
            expect(result[3]).toBe('0x1234abcd');
            expect(result[4]).toBe('0x5678abcd');
        });

        it('should decode FullBalanceApprove hook data', () => {
            // Create encoded FullBalanceApprove hook data
            const approveData = [mockAddress1, mockAddress2, true];
            const encoded = new Interface(['function dummy(tuple(address,address,bool))'])
                .encodeFunctionData('dummy', [approveData]);
            const hookData = encoded.slice(10); // Remove selector

            const hook: Hook = {
                hookType: HookType.FullBalanceApprove,
                hookData: `0x${hookData}`,
            };

            const result = debugHelpers.decodeHookData(hook);

            expect(result[0]).toBe(mockAddress1);
            expect(result[1].toLowerCase()).toBe(mockAddress2.toLowerCase());
            expect(result[2]).toBe(true);
        });

        it('should decode FullBalanceTransfer hook data', () => {
            // Create encoded FullBalanceTransfer hook data
            const transferData = [mockAddress1, mockAddress2, false];
            const encoded = new Interface(['function dummy(tuple(address,address,bool))'])
                .encodeFunctionData('dummy', [transferData]);
            const hookData = encoded.slice(10); // Remove selector

            const hook: Hook = {
                hookType: HookType.FullBalanceTransfer,
                hookData: `0x${hookData}`,
            };

            const result = debugHelpers.decodeHookData(hook);

            expect(result[0]).toBe(mockAddress1);
            expect(result[1].toLowerCase()).toBe(mockAddress2.toLowerCase());
            expect(result[2]).toBe(false);
        });

        it('should throw error for unknown hook type', () => {
            const hook: Hook = {
                hookType: 99 as HookType, // Invalid hook type
                hookData: '0x1234',
            };

            expect(() => debugHelpers.decodeHookData(hook)).toThrow('Unknown hook type: 99');
        });

        it('should throw error for invalid hook data', () => {
            const hook: Hook = {
                hookType: HookType.Custom,
                hookData: '0xinvalid',
            };

            expect(() => debugHelpers.decodeHookData(hook)).toThrow('Failed to decode hook data');
        });
    });

    describe('estimateGasUsage', () => {
        it('should estimate gas for empty ZapCall', () => {
            const zapCall: ZapCall = {
                hooks: [],
                bridgeData: {
                    tokens: [],
                    nfts: [],
                    isRequired: false,
                },
            };

            const result = debugHelpers.estimateGasUsage(zapCall);

            expect(result).toBe(50000); // Base gas only
        });

        it('should estimate gas for Custom hooks', () => {
            const zapCall: ZapCall = {
                hooks: [
                    { hookType: HookType.Custom, hookData: '0x1234' },
                    { hookType: HookType.Custom, hookData: '0x5678' },
                ],
                bridgeData: {
                    tokens: [],
                    nfts: [],
                    isRequired: false,
                },
            };

            const result = debugHelpers.estimateGasUsage(zapCall);

            expect(result).toBe(250000); // 50000 base + 2 * 100000 custom
        });

        it('should estimate gas for FullBalanceApprove hooks', () => {
            const zapCall: ZapCall = {
                hooks: [
                    { hookType: HookType.FullBalanceApprove, hookData: '0x1234' },
                ],
                bridgeData: {
                    tokens: [],
                    nfts: [],
                    isRequired: false,
                },
            };

            const result = debugHelpers.estimateGasUsage(zapCall);

            expect(result).toBe(100000); // 50000 base + 50000 approve
        });

        it('should estimate gas for FullBalanceTransfer hooks', () => {
            const zapCall: ZapCall = {
                hooks: [
                    { hookType: HookType.FullBalanceTransfer, hookData: '0x1234' },
                ],
                bridgeData: {
                    tokens: [],
                    nfts: [],
                    isRequired: false,
                },
            };

            const result = debugHelpers.estimateGasUsage(zapCall);

            expect(result).toBe(115000); // 50000 base + 65000 transfer
        });

        it('should estimate gas with bridge operations', () => {
            const zapCall: ZapCall = {
                hooks: [],
                bridgeData: {
                    tokens: [mockAddress1],
                    nfts: [],
                    isRequired: true,
                },
            };

            const result = debugHelpers.estimateGasUsage(zapCall);

            expect(result).toBe(250000); // 50000 base + 200000 bridge
        });

        it('should estimate gas for mixed hooks and bridge', () => {
            const zapCall: ZapCall = {
                hooks: [
                    { hookType: HookType.Custom, hookData: '0x1234' },
                    { hookType: HookType.FullBalanceApprove, hookData: '0x5678' },
                ],
                bridgeData: {
                    tokens: [mockAddress1],
                    nfts: [],
                    isRequired: true,
                },
            };

            const result = debugHelpers.estimateGasUsage(zapCall);

            expect(result).toBe(400000); // 50000 base + 100000 custom + 50000 approve + 200000 bridge
        });
    });

    describe('visualizeZapCall', () => {
        it('should visualize empty ZapCall', () => {
            const zapCall: ZapCall = {
                hooks: [],
                bridgeData: {
                    tokens: [],
                    nfts: [],
                    isRequired: false,
                },
            };

            debugHelpers.visualizeZapCall(zapCall, mockContractInterfaces);

            expect(console.log).toHaveBeenCalledWith('🔗 ZapCall Chain Visualization');
            expect(console.log).toHaveBeenCalledWith('❌ No hooks in this ZapCall');
        });

        it('should visualize ZapCall with hooks', () => {
            // Create a proper Custom hook with encoded data
            const customData = [true, mockAddress1, 0n, '0x1234', '0x'];
            const encoded = new Interface(['function dummy(tuple(bool,address,uint256,bytes,bytes))'])
                .encodeFunctionData('dummy', [customData]);
            const hookData = encoded.slice(10);

            const zapCall: ZapCall = {
                hooks: [
                    { hookType: HookType.Custom, hookData: `0x${hookData}` },
                ],
                bridgeData: {
                    tokens: [],
                    nfts: [],
                    isRequired: false,
                },
            };

            debugHelpers.visualizeZapCall(zapCall, mockContractInterfaces);

            expect(console.log).toHaveBeenCalledWith('🔗 ZapCall Chain Visualization');
            expect(console.log).toHaveBeenCalledWith('================================');
            // Should have multiple console.log calls for visualization
            expect(console.log).toHaveBeenCalledTimes(9);
        });

        it('should visualize ZapCall with bridge operations', () => {
            const zapCall: ZapCall = {
                hooks: [],
                bridgeData: {
                    tokens: [mockAddress1],
                    nfts: [{ nft: mockAddress2, id: 1n, amount: 2n }],
                    isRequired: true,
                },
            };

            debugHelpers.visualizeZapCall(zapCall, mockContractInterfaces);

            expect(console.log).toHaveBeenCalledWith('🔗 ZapCall Chain Visualization');
            expect(console.log).toHaveBeenCalledWith('❌ No hooks in this ZapCall');
            // Should have console.log calls for bridge operations
            expect(console.log).toHaveBeenCalledTimes(3);
        });
    });

    describe('getZapCallBreakdown', () => {
        it('should get breakdown for empty ZapCall', () => {
            const zapCall: ZapCall = {
                hooks: [],
                bridgeData: {
                    tokens: [],
                    nfts: [],
                    isRequired: false,
                },
            };

            const result = debugHelpers.getZapCallBreakdown(zapCall, mockContractInterfaces);

            expect(result.totalHooks).toBe(0);
            expect(result.hookTypes).toEqual({});
            expect(result.gasEstimate).toBe(50000);
            expect(result.bridgeRequired).toBe(false);
            expect(result.hookDescriptions).toEqual([]);
        });

        it('should get breakdown for ZapCall with various hooks', () => {
            // Create encoded hook data
            const customData = [true, mockAddress1, 0n, '0x1234', '0x'];
            const approveData = [mockAddress1, mockAddress2, true];
            
            const customEncoded = new Interface(['function dummy(tuple(bool,address,uint256,bytes,bytes))'])
                .encodeFunctionData('dummy', [customData]);
            const approveEncoded = new Interface(['function dummy(tuple(address,address,bool))'])
                .encodeFunctionData('dummy', [approveData]);

            const zapCall: ZapCall = {
                hooks: [
                    { hookType: HookType.Custom, hookData: `0x${customEncoded.slice(10)}` },
                    { hookType: HookType.FullBalanceApprove, hookData: `0x${approveEncoded.slice(10)}` },
                    { hookType: HookType.FullBalanceApprove, hookData: `0x${approveEncoded.slice(10)}` },
                ],
                bridgeData: {
                    tokens: [mockAddress1],
                    nfts: [],
                    isRequired: true,
                },
            };

            const result = debugHelpers.getZapCallBreakdown(zapCall, mockContractInterfaces);

            expect(result.totalHooks).toBe(3);
            expect(result.hookTypes).toEqual({
                Custom: 1,
                FullBalanceApprove: 2,
            });
            expect(result.gasEstimate).toBe(450000); // 50000 + 100000 + 50000 + 50000 + 200000
            expect(result.bridgeRequired).toBe(true);
            expect(result.hookDescriptions).toHaveLength(3);
        });
    });

    describe('compareZapCalls', () => {
        it('should compare two ZapCalls', () => {
            const zapCall1: ZapCall = {
                hooks: [],
                bridgeData: { tokens: [], nfts: [], isRequired: false },
            };

            const customData = [true, mockAddress1, 0n, '0x1234', '0x'];
            const customEncoded = new Interface(['function dummy(tuple(bool,address,uint256,bytes,bytes))'])
                .encodeFunctionData('dummy', [customData]);

            const zapCall2: ZapCall = {
                hooks: [
                    { hookType: HookType.Custom, hookData: `0x${customEncoded.slice(10)}` },
                ],
                bridgeData: { tokens: [], nfts: [], isRequired: false },
            };

            debugHelpers.compareZapCalls(zapCall1, zapCall2, 'Test 1', 'Test 2', mockContractInterfaces);

            expect(console.log).toHaveBeenCalledWith('🔄 Comparing Test 1 vs Test 2');
            // Should have multiple console.log calls for comparison
            expect(console.log).toHaveBeenCalledTimes(10);
        });
    });

    describe('encodeZapCall', () => {
        it('should encode empty ZapCall', () => {
            const zapCall: ZapCall = {
                hooks: [],
                bridgeData: {
                    tokens: [],
                    nfts: [],
                    isRequired: false,
                },
            };

            const result = debugHelpers.encodeZapCall(zapCall);

            expect(result).toMatch(/^0x[0-9a-fA-F]+$/);
            expect(result.length).toBeGreaterThan(2);
        });

        it('should encode ZapCall with hooks', () => {
            const customData = [true, mockAddress1, 0n, '0x1234', '0x'];
            const customEncoded = new Interface(['function dummy(tuple(bool,address,uint256,bytes,bytes))'])
                .encodeFunctionData('dummy', [customData]);

            const zapCall: ZapCall = {
                hooks: [
                    { hookType: HookType.Custom, hookData: `0x${customEncoded.slice(10)}` },
                ],
                bridgeData: {
                    tokens: [],
                    nfts: [],
                    isRequired: false,
                },
            };

            const result = debugHelpers.encodeZapCall(zapCall);

            expect(result).toMatch(/^0x[0-9a-fA-F]+$/);
            expect(result.length).toBeGreaterThan(100); // Should be longer with hook data
        });

        it('should encode ZapCall with bridge data', () => {
            const zapCall: ZapCall = {
                hooks: [],
                bridgeData: {
                    tokens: [mockAddress1, mockAddress2],
                    nfts: [
                        { nft: mockAddress1, id: 1n, amount: 2n },
                        { nft: mockAddress2, id: 5n, amount: 1n },
                    ],
                    isRequired: true,
                },
            };

            const result = debugHelpers.encodeZapCall(zapCall);

            expect(result).toMatch(/^0x[0-9a-fA-F]+$/);
            expect(result.length).toBeGreaterThan(200); // Should be longer with bridge data
        });
    });

    describe('private helper methods', () => {
        it('should handle _formatAddress for short addresses', () => {
            const shortAddress = '0x1234567890123456789012345678901234567890';
            const customData = [true, shortAddress, 0n, '0x1234', '0x'];
            const customEncoded = new Interface(['function dummy(tuple(bool,address,uint256,bytes,bytes))'])
                .encodeFunctionData('dummy', [customData]);

            const zapCall: ZapCall = {
                hooks: [
                    { hookType: HookType.Custom, hookData: `0x${customEncoded.slice(10)}` },
                ],
                bridgeData: { tokens: [], nfts: [], isRequired: false },
            };

            // This will internally use _formatAddress
            const breakdown = debugHelpers.getZapCallBreakdown(zapCall, mockContractInterfaces);
            expect(breakdown.hookDescriptions).toHaveLength(1);
        });

        it('should handle custom hooks with function signature detection', () => {
            // Create custom hook data with a recognizable function selector
            const transferSelector = mockContractInterface.getFunction('transfer')!.selector;
            const customData = [
                true,
                mockAddress1,
                0n,
                transferSelector + '0'.repeat(56), // Add some padding
                '0x',
            ];
            const customEncoded = new Interface(['function dummy(tuple(bool,address,uint256,bytes,bytes))'])
                .encodeFunctionData('dummy', [customData]);

            const zapCall: ZapCall = {
                hooks: [
                    { hookType: HookType.Custom, hookData: `0x${customEncoded.slice(10)}` },
                ],
                bridgeData: { tokens: [], nfts: [], isRequired: false },
            };

            const breakdown = debugHelpers.getZapCallBreakdown(zapCall, mockContractInterfaces);
            expect(breakdown.hookDescriptions[0]).toContain('transfer(address, uint256)');
        });

        it('should handle custom hooks with dynamic replacements', () => {
            const customData = [
                true,
                mockAddress1,
                1000n, // Value > 0
                '0x1234567890', // Valid data
                '0x123456', // Non-empty mission info (indicates replacements)
            ];
            const customEncoded = new Interface(['function dummy(tuple(bool,address,uint256,bytes,bytes))'])
                .encodeFunctionData('dummy', [customData]);

            const zapCall: ZapCall = {
                hooks: [
                    { hookType: HookType.Custom, hookData: `0x${customEncoded.slice(10)}` },
                ],
                bridgeData: { tokens: [], nfts: [], isRequired: false },
            };

            const breakdown = debugHelpers.getZapCallBreakdown(zapCall, mockContractInterfaces);
            expect(breakdown.hookDescriptions[0]).toContain('dynamic value replacement');
            expect(breakdown.hookDescriptions[0]).toContain('sending');
        });

        it('should handle errors in hook description gracefully', () => {
            // Create valid hook data first
            const customData = [true, mockAddress1, 0n, '0x1234', '0x'];
            const customEncoded = new Interface(['function dummy(tuple(bool,address,uint256,bytes,bytes))'])
                .encodeFunctionData('dummy', [customData]);

            const hook: Hook = {
                hookType: HookType.Custom,
                hookData: `0x${customEncoded.slice(10)}`,
            };

            // Mock decodeHookData to throw an error to test error handling
            const originalDecodeHookData = debugHelpers.decodeHookData;
            debugHelpers.decodeHookData = jest.fn().mockImplementation(() => {
                throw new Error('Mock decode error');
            });

            const zapCall: ZapCall = {
                hooks: [hook],
                bridgeData: { tokens: [], nfts: [], isRequired: false },
            };

            // Should not throw, should handle error gracefully
            const breakdown = debugHelpers.getZapCallBreakdown(zapCall, mockContractInterfaces);
            expect(breakdown.hookDescriptions[0]).toContain('Error describing hook');

            // Restore original method
            debugHelpers.decodeHookData = originalDecodeHookData;
        });
    });
});