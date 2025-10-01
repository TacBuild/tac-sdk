import { AgnosticProxySDK } from '../../../src';
import { Network } from '../../../src';
import { AbiHandler } from '../../../src/agnosticSdk/AbiHandler';
import { DebugHelpers } from '../../../src/agnosticSdk/DebugHelpers';
import { HooksHandler } from '../../../src/agnosticSdk/HooksHandler';
import { ReplacementHelper } from '../../../src/agnosticSdk/ReplacementHelper';

// Mock the helper classes
jest.mock('../../../src/agnosticSdk/AbiHandler');
jest.mock('../../../src/agnosticSdk/HooksHandler');
jest.mock('../../../src/agnosticSdk/ReplacementHelper');
jest.mock('../../../src/agnosticSdk/DebugHelpers');

const MockedAbiHandler = AbiHandler as jest.MockedClass<typeof AbiHandler>;
const MockedHooksHandler = HooksHandler as jest.MockedClass<typeof HooksHandler>;
const MockedReplacementHelper = ReplacementHelper as jest.MockedClass<typeof ReplacementHelper>;
const MockedDebugHelpers = DebugHelpers as jest.MockedClass<typeof DebugHelpers>;

// Mock the artifact imports
jest.mock('../../../artifacts/mainnet', () => ({
    AGNOSTIC_PROXY_ADDRESS: '0xMAINNET_PROXY_ADDRESS'
}));

jest.mock('../../../artifacts/testnet', () => ({
    AGNOSTIC_PROXY_ADDRESS: '0xTESTNET_PROXY_ADDRESS'
}));

describe('AgnosticProxySDK', () => {
    const mockAbiHandlerInstance = {
        addContractInterface: jest.fn().mockReturnThis(),
        contractInterfaces: new Map(),
    };
    
    const mockHooksHandlerInstance = {
        createCustomHook: jest.fn().mockReturnValue({ type: 'custom', data: 'mock-hook' }),
        createFullBalanceApproveHook: jest.fn().mockReturnValue({ type: 'approve', data: 'mock-approve' }),
        createFullBalanceTransferHook: jest.fn().mockReturnValue({ type: 'transfer', data: 'mock-transfer' }),
        createMultipleApproves: jest.fn().mockReturnValue([{ type: 'approve', data: 'mock-multiple' }]),
    };
    
    const mockReplacementHelperInstance = {
        createAmountReplacement: jest.fn().mockReturnValue({ position: 4, len: 32, token: 'mock-token', balanceAddress: 'mock-address' }),
        calculateReplacementData: jest.fn().mockReturnValue({ position: 8, len: 32, token: 'calculated-token', balanceAddress: 'calculated-address' }),
        getReplacementHelper: jest.fn().mockReturnValue({ contractAddress: 'mock-contract', functions: [] }),
        buildReplacementInteractive: jest.fn().mockReturnValue({
            replacement: { position: 4, len: 32, token: 'interactive-token', balanceAddress: 'interactive-address' },
            calculation: { functionSignature: 'mock-signature', parameterInfo: { name: 'param', type: 'uint256', index: 0, position: 4, length: 32 }, positionCalculation: 'mock-calc' },
            validation: { isValid: true, warnings: [], suggestions: [] }
        }),
    };
    
    const mockDebugHelpersInstance = {
        decodeHookData: jest.fn().mockReturnValue({ decoded: 'mock-decoded' }),
        estimateGasUsage: jest.fn().mockReturnValue(21000),
        visualizeZapCall: jest.fn(),
        getZapCallBreakdown: jest.fn().mockReturnValue({
            totalHooks: 2,
            hookTypes: { 'custom': 1, 'approve': 1 },
            gasEstimate: 42000,
            encodedSize: 256,
            bridgeRequired: true,
            hookDescriptions: ['Custom hook', 'Approve hook']
        }),
        compareZapCalls: jest.fn(),
        buildZapCall: jest.fn().mockReturnValue({ hooks: [], bridgeTokens: [], bridgeNFTs: [] }),
        encodeZapCall: jest.fn().mockReturnValue('0xencoded'),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        
        MockedAbiHandler.mockImplementation(() => mockAbiHandlerInstance as any);
        MockedHooksHandler.mockImplementation(() => mockHooksHandlerInstance as any);
        MockedReplacementHelper.mockImplementation(() => mockReplacementHelperInstance as any);
        MockedDebugHelpers.mockImplementation(() => mockDebugHelpersInstance as any);
    });

    describe('constructor', () => {
        it('should initialize with mainnet network and default proxy address', () => {
            const sdk = new AgnosticProxySDK(Network.MAINNET);
            
            expect(sdk).toBeDefined();
            expect(MockedAbiHandler).toHaveBeenCalledTimes(1);
            expect(MockedHooksHandler).toHaveBeenCalledTimes(1);
            expect(MockedReplacementHelper).toHaveBeenCalledTimes(1);
            expect(MockedDebugHelpers).toHaveBeenCalledTimes(1);
        });

        it('should initialize with testnet network and default proxy address', () => {
            const sdk = new AgnosticProxySDK(Network.TESTNET);
            
            expect(sdk).toBeDefined();
        });

        it('should initialize with mainnet network and custom proxy address', () => {
            const customProxy = '0xCUSTOM_PROXY_ADDRESS';
            const sdk = new AgnosticProxySDK(Network.MAINNET, customProxy);
            
            expect(sdk).toBeDefined();
        });

        it('should initialize with testnet network and custom proxy address', () => {
            const customProxy = '0xCUSTOM_TESTNET_PROXY';
            const sdk = new AgnosticProxySDK(Network.TESTNET, customProxy);
            
            expect(sdk).toBeDefined();
        });

        it('should initialize with dev network and require custom proxy address', () => {
            const customProxy = '0xDEV_PROXY_ADDRESS';
            const sdk = new AgnosticProxySDK(Network.DEV, customProxy);
            
            expect(sdk).toBeDefined();
        });

        it('should throw error for dev network without proxy address', () => {
            expect(() => {
                new AgnosticProxySDK(Network.DEV);
            }).toThrow('Agnostic proxy address is required for dev network');
        });
    });

    describe('addContractInterface', () => {
        it('should delegate to abiHandler and return this for chaining', () => {
            const sdk = new AgnosticProxySDK(Network.TESTNET);
            const address = '0xCONTRACT_ADDRESS';
            const abi = ['function test() external'];

            const result = sdk.addContractInterface(address, abi);

            expect(mockAbiHandlerInstance.addContractInterface).toHaveBeenCalledWith(address, abi);
            expect(result).toBe(sdk);
        });
    });

    describe('createCustomHook', () => {
        it('should delegate to hooksHandler with default options', () => {
            const sdk = new AgnosticProxySDK(Network.TESTNET);
            const contractAddress = '0xCONTRACT';
            const functionName = 'testFunction';
            const params = ['param1', 'param2'];

            const result = sdk.createCustomHook(contractAddress, functionName, params);

            expect(mockHooksHandlerInstance.createCustomHook).toHaveBeenCalledWith(
                contractAddress,
                functionName,
                params,
                mockAbiHandlerInstance.contractInterfaces,
                {}
            );
            expect(result).toEqual({ type: 'custom', data: 'mock-hook' });
        });

        it('should delegate to hooksHandler with custom options', () => {
            const sdk = new AgnosticProxySDK(Network.TESTNET);
            const contractAddress = '0xCONTRACT';
            const functionName = 'testFunction';
            const params = ['param1'];
            const options = {
                isFromSAPerspective: false,
                value: 1000n,
                dynamicReplacements: [{ position: 4, len: 32, token: 'token', balanceAddress: 'address' }]
            };

            const result = sdk.createCustomHook(contractAddress, functionName, params, options);

            expect(mockHooksHandlerInstance.createCustomHook).toHaveBeenCalledWith(
                contractAddress,
                functionName,
                params,
                mockAbiHandlerInstance.contractInterfaces,
                options
            );
            expect(result).toEqual({ type: 'custom', data: 'mock-hook' });
        });
    });

    describe('createFullBalanceApproveHook', () => {
        it('should delegate to hooksHandler with default isFromSAPerspective', () => {
            const sdk = new AgnosticProxySDK(Network.TESTNET);
            const token = '0xTOKEN';
            const to = '0xSPENDER';

            const result = sdk.createFullBalanceApproveHook(token, to);

            expect(mockHooksHandlerInstance.createFullBalanceApproveHook).toHaveBeenCalledWith(token, to, true);
            expect(result).toEqual({ type: 'approve', data: 'mock-approve' });
        });

        it('should delegate to hooksHandler with custom isFromSAPerspective', () => {
            const sdk = new AgnosticProxySDK(Network.TESTNET);
            const token = '0xTOKEN';
            const to = '0xSPENDER';

            const result = sdk.createFullBalanceApproveHook(token, to, false);

            expect(mockHooksHandlerInstance.createFullBalanceApproveHook).toHaveBeenCalledWith(token, to, false);
            expect(result).toEqual({ type: 'approve', data: 'mock-approve' });
        });
    });

    describe('createFullBalanceTransferHook', () => {
        it('should delegate to hooksHandler with default isFromSAPerspective', () => {
            const sdk = new AgnosticProxySDK(Network.TESTNET);
            const token = '0xTOKEN';
            const to = '0xRECIPIENT';

            const result = sdk.createFullBalanceTransferHook(token, to);

            expect(mockHooksHandlerInstance.createFullBalanceTransferHook).toHaveBeenCalledWith(token, to, true);
            expect(result).toEqual({ type: 'transfer', data: 'mock-transfer' });
        });

        it('should delegate to hooksHandler with custom isFromSAPerspective', () => {
            const sdk = new AgnosticProxySDK(Network.TESTNET);
            const token = '0xTOKEN';
            const to = '0xRECIPIENT';

            const result = sdk.createFullBalanceTransferHook(token, to, false);

            expect(mockHooksHandlerInstance.createFullBalanceTransferHook).toHaveBeenCalledWith(token, to, false);
            expect(result).toEqual({ type: 'transfer', data: 'mock-transfer' });
        });
    });

    describe('createMultipleApproves', () => {
        it('should delegate to hooksHandler', () => {
            const sdk = new AgnosticProxySDK(Network.TESTNET);
            const approvals = [
                { token: '0xTOKEN1', spender: '0xSPENDER1', isFromSA: true },
                { token: '0xTOKEN2', spender: '0xSPENDER2', isFromSA: false }
            ];

            const result = sdk.createMultipleApproves(approvals);

            expect(mockHooksHandlerInstance.createMultipleApproves).toHaveBeenCalledWith(approvals);
            expect(result).toEqual([{ type: 'approve', data: 'mock-multiple' }]);
        });
    });

    describe('createHookSequence', () => {
        it('should create sequence of custom hooks', () => {
            const sdk = new AgnosticProxySDK(Network.TESTNET);
            const calls = [
                { contract: '0xCONTRACT1', functionName: 'func1', params: ['param1'] },
                { contract: '0xCONTRACT2', functionName: 'func2', params: ['param2'], options: { value: 100n } }
            ];

            const result = sdk.createHookSequence(calls);

            expect(mockHooksHandlerInstance.createCustomHook).toHaveBeenCalledTimes(2);
            expect(mockHooksHandlerInstance.createCustomHook).toHaveBeenNthCalledWith(
                1,
                '0xCONTRACT1',
                'func1',
                ['param1'],
                mockAbiHandlerInstance.contractInterfaces,
                {}
            );
            expect(mockHooksHandlerInstance.createCustomHook).toHaveBeenNthCalledWith(
                2,
                '0xCONTRACT2',
                'func2',
                ['param2'],
                mockAbiHandlerInstance.contractInterfaces,
                { value: 100n }
            );
            expect(result).toHaveLength(2);
        });
    });

    describe('replacement methods', () => {
        describe('createAmountReplacement', () => {
            it('should delegate to replacementHelper', () => {
                const sdk = new AgnosticProxySDK(Network.TESTNET);
                const paramIndex = 2;
                const token = '0xTOKEN';
                const balanceAddress = '0xBALANCE_ADDRESS';

                const result = sdk.createAmountReplacement(paramIndex, token, balanceAddress);

                expect(mockReplacementHelperInstance.createAmountReplacement).toHaveBeenCalledWith(paramIndex, token, balanceAddress);
                expect(result).toEqual({ position: 4, len: 32, token: 'mock-token', balanceAddress: 'mock-address' });
            });
        });

        describe('calculateReplacementData', () => {
            it('should delegate to replacementHelper', () => {
                const sdk = new AgnosticProxySDK(Network.TESTNET);
                const contractAddress = '0xCONTRACT';
                const functionName = 'testFunction';
                const parameterName = 'amount';
                const token = '0xTOKEN';
                const balanceAddress = '0xBALANCE';

                const result = sdk.calculateReplacementData(contractAddress, functionName, parameterName, token, balanceAddress);

                expect(mockReplacementHelperInstance.calculateReplacementData).toHaveBeenCalledWith(
                    contractAddress,
                    functionName,
                    parameterName,
                    token,
                    balanceAddress,
                    mockAbiHandlerInstance.contractInterfaces
                );
                expect(result).toEqual({ position: 8, len: 32, token: 'calculated-token', balanceAddress: 'calculated-address' });
            });
        });

        describe('getReplacementHelper', () => {
            it('should delegate to replacementHelper', () => {
                const sdk = new AgnosticProxySDK(Network.TESTNET);
                const contractAddress = '0xCONTRACT';

                const result = sdk.getReplacementHelper(contractAddress);

                expect(mockReplacementHelperInstance.getReplacementHelper).toHaveBeenCalledWith(
                    contractAddress,
                    mockAbiHandlerInstance.contractInterfaces
                );
                expect(result).toEqual({ contractAddress: 'mock-contract', functions: [] });
            });
        });

        describe('buildReplacementInteractive', () => {
            it('should delegate to replacementHelper with default options', () => {
                const sdk = new AgnosticProxySDK(Network.TESTNET);
                const contractAddress = '0xCONTRACT';
                const functionName = 'testFunction';
                const parameterName = 'amount';
                const token = '0xTOKEN';
                const balanceAddress = '0xBALANCE';

                const result = sdk.buildReplacementInteractive(contractAddress, functionName, parameterName, token, balanceAddress);

                expect(mockReplacementHelperInstance.buildReplacementInteractive).toHaveBeenCalledWith(
                    contractAddress,
                    functionName,
                    parameterName,
                    token,
                    balanceAddress,
                    mockAbiHandlerInstance.contractInterfaces,
                    {}
                );
                expect(result.replacement).toBeDefined();
                expect(result.calculation).toBeDefined();
                expect(result.validation).toBeDefined();
            });

            it('should delegate to replacementHelper with custom options', () => {
                const sdk = new AgnosticProxySDK(Network.TESTNET);
                const contractAddress = '0xCONTRACT';
                const functionName = 'testFunction';
                const parameterName = 'amount';
                const token = '0xTOKEN';
                const balanceAddress = '0xBALANCE';
                const options = { showCalculation: true, validate: true };

                const result = sdk.buildReplacementInteractive(contractAddress, functionName, parameterName, token, balanceAddress, options);

                expect(mockReplacementHelperInstance.buildReplacementInteractive).toHaveBeenCalledWith(
                    contractAddress,
                    functionName,
                    parameterName,
                    token,
                    balanceAddress,
                    mockAbiHandlerInstance.contractInterfaces,
                    options
                );
                expect(result.replacement).toBeDefined();
                expect(result.calculation).toBeDefined();
                expect(result.validation).toBeDefined();
            });
        });
    });

    describe('debug methods', () => {
        describe('decodeHookData', () => {
            it('should delegate to debugHelpers', () => {
                const sdk = new AgnosticProxySDK(Network.TESTNET);
                const hook = { type: 'test', data: 'test-hook' };

                const result = sdk.decodeHookData(hook as any);

                expect(mockDebugHelpersInstance.decodeHookData).toHaveBeenCalledWith(hook);
                expect(result).toEqual({ decoded: 'mock-decoded' });
            });
        });

        describe('estimateGasUsage', () => {
            it('should delegate to debugHelpers', () => {
                const sdk = new AgnosticProxySDK(Network.TESTNET);
                const zapCall = { hooks: [], bridgeTokens: [], bridgeNFTs: [] };

                const result = sdk.estimateGasUsage(zapCall as any);

                expect(mockDebugHelpersInstance.estimateGasUsage).toHaveBeenCalledWith(zapCall);
                expect(result).toBe(21000);
            });
        });

        describe('visualizeZapCall', () => {
            it('should delegate to debugHelpers', () => {
                const sdk = new AgnosticProxySDK(Network.TESTNET);
                const zapCall = { hooks: [], bridgeTokens: [], bridgeNFTs: [] };

                sdk.visualizeZapCall(zapCall as any);

                expect(mockDebugHelpersInstance.visualizeZapCall).toHaveBeenCalledWith(zapCall, mockAbiHandlerInstance.contractInterfaces);
            });
        });

        describe('getZapCallBreakdown', () => {
            it('should delegate to debugHelpers', () => {
                const sdk = new AgnosticProxySDK(Network.TESTNET);
                const zapCall = { hooks: [], bridgeTokens: [], bridgeNFTs: [] };

                const result = sdk.getZapCallBreakdown(zapCall as any);

                expect(mockDebugHelpersInstance.getZapCallBreakdown).toHaveBeenCalledWith(zapCall, mockAbiHandlerInstance.contractInterfaces);
                expect(result).toEqual({
                    totalHooks: 2,
                    hookTypes: { 'custom': 1, 'approve': 1 },
                    gasEstimate: 42000,
                    encodedSize: 256,
                    bridgeRequired: true,
                    hookDescriptions: ['Custom hook', 'Approve hook']
                });
            });
        });

        describe('compareZapCalls', () => {
            it('should delegate to debugHelpers with default labels', () => {
                const sdk = new AgnosticProxySDK(Network.TESTNET);
                const zapCall1 = { hooks: [], bridgeTokens: [], bridgeNFTs: [] };
                const zapCall2 = { hooks: [], bridgeTokens: [], bridgeNFTs: [] };

                sdk.compareZapCalls(zapCall1 as any, zapCall2 as any);

                expect(mockDebugHelpersInstance.compareZapCalls).toHaveBeenCalledWith(
                    zapCall1,
                    zapCall2,
                    'ZapCall 1',
                    'ZapCall 2',
                    mockAbiHandlerInstance.contractInterfaces
                );
            });

            it('should delegate to debugHelpers with custom labels', () => {
                const sdk = new AgnosticProxySDK(Network.TESTNET);
                const zapCall1 = { hooks: [], bridgeTokens: [], bridgeNFTs: [] };
                const zapCall2 = { hooks: [], bridgeTokens: [], bridgeNFTs: [] };

                sdk.compareZapCalls(zapCall1 as any, zapCall2 as any, 'Custom Label 1', 'Custom Label 2');

                expect(mockDebugHelpersInstance.compareZapCalls).toHaveBeenCalledWith(
                    zapCall1,
                    zapCall2,
                    'Custom Label 1',
                    'Custom Label 2',
                    mockAbiHandlerInstance.contractInterfaces
                );
            });
        });
    });

    describe('getAgnosticCallParams', () => {
        it('should return correct call parameters', () => {
            const sdk = new AgnosticProxySDK(Network.TESTNET);

            const result = sdk.getAgnosticCallParams();

            expect(result).toEqual({
                evmTargetAddress: '0xTESTNET_PROXY_ADDRESS',
                methodName: 'Zap(bytes,bytes)'
            });
        });

        it('should return correct call parameters for mainnet', () => {
            const sdk = new AgnosticProxySDK(Network.MAINNET);

            const result = sdk.getAgnosticCallParams();

            expect(result).toEqual({
                evmTargetAddress: '0xMAINNET_PROXY_ADDRESS',
                methodName: 'Zap(bytes,bytes)'
            });
        });

        it('should return correct call parameters for dev network', () => {
            const customProxy = '0xDEV_PROXY';
            const sdk = new AgnosticProxySDK(Network.DEV, customProxy);

            const result = sdk.getAgnosticCallParams();

            expect(result).toEqual({
                evmTargetAddress: customProxy,
                methodName: 'Zap(bytes,bytes)'
            });
        });
    });

    describe('buildZapCall', () => {
        it('should delegate to debugHelpers with default parameters', () => {
            const sdk = new AgnosticProxySDK(Network.TESTNET);
            const hooks = [{ type: 'test', data: 'hook' }];

            const result = sdk.buildZapCall(hooks as any);

            expect(mockDebugHelpersInstance.buildZapCall).toHaveBeenCalledWith(hooks, [], []);
            expect(result).toEqual({ hooks: [], bridgeTokens: [], bridgeNFTs: [] });
        });

        it('should delegate to debugHelpers with custom parameters', () => {
            const sdk = new AgnosticProxySDK(Network.TESTNET);
            const hooks = [{ type: 'test', data: 'hook' }];
            const bridgeTokens = ['0xTOKEN1', '0xTOKEN2'];
            const bridgeNFTs = [{ collection: '0xNFT', index: 1n }];

            const result = sdk.buildZapCall(hooks as any, bridgeTokens, bridgeNFTs as any);

            expect(mockDebugHelpersInstance.buildZapCall).toHaveBeenCalledWith(hooks, bridgeTokens, bridgeNFTs);
            expect(result).toEqual({ hooks: [], bridgeTokens: [], bridgeNFTs: [] });
        });
    });

    describe('encodeZapCall', () => {
        it('should delegate to debugHelpers', () => {
            const sdk = new AgnosticProxySDK(Network.TESTNET);
            const zapCall = { hooks: [], bridgeTokens: [], bridgeNFTs: [] };

            const result = sdk.encodeZapCall(zapCall as any);

            expect(mockDebugHelpersInstance.encodeZapCall).toHaveBeenCalledWith(zapCall);
            expect(result).toBe('0xencoded');
        });
    });
});