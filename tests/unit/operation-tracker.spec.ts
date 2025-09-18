import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { ILiteSequencerClient, ILiteSequencerClientFactory, OperationTracker } from '../../src';
import {
    AssetType,
    BlockchainType,
    ConvertCurrencyParams,
    ConvertedCurrencyResult,
    CurrencyType,
    ExecutionStages,
    ExecutionStagesByOperationId,
    ILogger,
    Network,
    OperationIdsByShardsKey,
    OperationType,
    SimplifiedStatuses,
    StageName,
    StatusInfo,
    StatusInfosByOperationId,
    TokenSymbol,
    TransactionLinker,
    WaitOptions,
} from '../../src';

// Mock implementations
class MockLogger implements ILogger {
    debug = jest.fn();
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
}

class MockLiteSequencerClient implements ILiteSequencerClient {
    getOperationType = jest.fn<ILiteSequencerClient['getOperationType']>();
    getOperationId = jest.fn<ILiteSequencerClient['getOperationId']>();
    getOperationIdByTransactionHash = jest.fn<ILiteSequencerClient['getOperationIdByTransactionHash']>();
    getOperationIdsByShardsKeys = jest.fn<ILiteSequencerClient['getOperationIdsByShardsKeys']>();
    getStageProfilings = jest.fn<ILiteSequencerClient['getStageProfilings']>();
    getOperationStatuses = jest.fn<ILiteSequencerClient['getOperationStatuses']>();
    convertCurrency = jest.fn<ILiteSequencerClient['convertCurrency']>();
    simulateTACMessage = jest.fn<ILiteSequencerClient['simulateTACMessage']>();
    getTVMExecutorFee = jest.fn<ILiteSequencerClient['getTVMExecutorFee']>();
}

class MockLiteSequencerClientFactory implements ILiteSequencerClientFactory {
    private clients: MockLiteSequencerClient[] = [];

    createClients(endpoints: string[]): ILiteSequencerClient[] {
        this.clients = endpoints.map(() => new MockLiteSequencerClient());
        return this.clients;
    }

    getClients(): MockLiteSequencerClient[] {
        return this.clients;
    }
}

describe('OperationTracker', () => {
    let operationTracker: OperationTracker;
    let mockLogger: MockLogger;
    let mockClientFactory: MockLiteSequencerClientFactory;
    let mockClients: MockLiteSequencerClient[];

    const sampleTransactionLinker: TransactionLinker = {
        caller: 'EQB123',
        shardCount: 1,
        shardsKey: '12345',
        timestamp: Date.now(),
    };

    beforeEach(() => {
        mockLogger = new MockLogger();
        mockClientFactory = new MockLiteSequencerClientFactory();

        operationTracker = new OperationTracker(
            Network.TESTNET,
            ['http://localhost:3000', 'http://localhost:3001'],
            mockLogger,
            mockClientFactory,
        );

        mockClients = mockClientFactory.getClients();
    });

    describe('getOperationType', () => {
        it('should successfully get operation type', async () => {
            const operationId = 'op123';
            const expectedType = OperationType.TON_TAC_TON;

            mockClients[0].getOperationType.mockResolvedValue(expectedType);

            const result = await operationTracker.getOperationType(operationId);

            expect(result).toBe(expectedType);
            expect(mockClients[0].getOperationType).toHaveBeenCalledWith(operationId);
            expect(mockLogger.debug).toHaveBeenCalledWith(`Getting operation type for "${operationId}"`);
            expect(mockLogger.debug).toHaveBeenCalledWith('Operation retrieved successfully');
        });

        it('should retry on second client if first fails', async () => {
            const operationId = 'op123';
            const expectedType = OperationType.TON_TAC;

            mockClients[0].getOperationType.mockRejectedValue(new Error('Network error'));
            mockClients[1].getOperationType.mockResolvedValue(expectedType);

            const result = await operationTracker.getOperationType(operationId);

            expect(result).toBe(expectedType);
            expect(mockClients[0].getOperationType).toHaveBeenCalledWith(operationId);
            expect(mockClients[1].getOperationType).toHaveBeenCalledWith(operationId);
            expect(mockLogger.warn).toHaveBeenCalledWith('Failed to get operationType using one of the endpoints');
        });

        it('should throw error if all endpoints fail', async () => {
            const operationId = 'op123';
            const error = new Error('Network error');

            mockClients[0].getOperationType.mockRejectedValue(error);
            mockClients[1].getOperationType.mockRejectedValue(error);

            await expect(operationTracker.getOperationType(operationId)).rejects.toThrow();
            expect(mockLogger.error).toHaveBeenCalledWith('All endpoints failed to get operation type');
        });

        it('should use waitUntilSuccess when wait options provided', async () => {
            const operationId = 'op123';
            const expectedType = OperationType.TON_TAC_TON;
            const waitOptions: WaitOptions<OperationType> = {
                timeout: 10000,
                maxAttempts: 5,
                delay: 1000,
            };

            mockClients[0].getOperationType.mockResolvedValue(expectedType);

            const result = await operationTracker.getOperationType(operationId, waitOptions);

            expect(result).toBe(expectedType);
        });
    });

    describe('getOperationId', () => {
        it('should successfully get operation ID', async () => {
            const expectedId = 'op123';

            mockClients[0].getOperationId.mockResolvedValue(expectedId);

            const result = await operationTracker.getOperationId(sampleTransactionLinker);

            expect(result).toBe(expectedId);
            expect(mockClients[0].getOperationId).toHaveBeenCalledWith(sampleTransactionLinker);
            expect(mockLogger.debug).toHaveBeenCalledWith('Operation ID retrieved successfully');
        });

        it('should handle empty operation ID', async () => {
            mockClients[0].getOperationId.mockResolvedValue('');

            const result = await operationTracker.getOperationId(sampleTransactionLinker);

            expect(result).toBe('');
            expect(mockLogger.debug).toHaveBeenCalledWith('Operation ID does not exist');
        });
    });

    describe('getOperationIdsByShardsKeys', () => {
        it('should successfully get operation IDs by shards keys', async () => {
            const shardsKeys = ['12345', '67890'];
            const caller = 'EQB123';
            const expectedResult: OperationIdsByShardsKey = {
                '12345': { operationIds: ['op1', 'op2'] },
                '67890': { operationIds: ['op3'] },
            };

            mockClients[0].getOperationIdsByShardsKeys.mockResolvedValue(expectedResult);

            const result = await operationTracker.getOperationIdsByShardsKeys(shardsKeys, caller);

            expect(result).toEqual(expectedResult);
            expect(mockClients[0].getOperationIdsByShardsKeys).toHaveBeenCalledWith(shardsKeys, caller, 100);
        });

        it('should use custom chunk size', async () => {
            const shardsKeys = ['12345'];
            const caller = 'EQB123';
            const chunkSize = 50;
            const expectedResult: OperationIdsByShardsKey = {
                '12345': { operationIds: ['op1'] },
            };

            mockClients[0].getOperationIdsByShardsKeys.mockResolvedValue(expectedResult);

            const result = await operationTracker.getOperationIdsByShardsKeys(shardsKeys, caller, undefined, chunkSize);

            expect(result).toEqual(expectedResult);
            expect(mockClients[0].getOperationIdsByShardsKeys).toHaveBeenCalledWith(shardsKeys, caller, chunkSize);
        });
    });

    describe('getStageProfiling', () => {
        it('should successfully get stage profiling', async () => {
            const operationId = 'op123';
            const expectedStages: ExecutionStages = {
                operationType: OperationType.TON_TAC_TON,
                metaInfo: {
                    initialCaller: {
                        address: 'EQB123',
                        blockchainType: BlockchainType.TON,
                    },
                    validExecutors: {
                        tac: ['0x123'],
                        ton: ['EQB123'],
                    },
                    feeInfo: {
                        additionalFeeInfo: {
                            attachedProtocolFee: '0.01',
                            tokenFeeSymbol: TokenSymbol.TON_SYMBOL,
                        },
                        tac: {
                            protocolFee: '0.1',
                            executorFee: '0.05',
                            tokenFeeSymbol: TokenSymbol.TAC_SYMBOL,
                        },
                        ton: {
                            protocolFee: '0.1',
                            executorFee: '0.05',
                            tokenFeeSymbol: TokenSymbol.TON_SYMBOL,
                        },
                    },
                    sentAssets: {
                        caller: {
                            address: 'EQB123',
                            blockchainType: BlockchainType.TON,
                        },
                        target: {
                            address: '0x456',
                            blockchainType: BlockchainType.TAC,
                        },
                        transactionHash: {
                            hash: '0x789',
                            blockchainType: BlockchainType.TAC,
                        },
                        assetMovements: [
                            {
                                assetType: AssetType.FT,
                                tvmAddress: 'EQB123',
                                evmAddress: '0x456',
                                amount: '1000000',
                                tokenId: null,
                            },
                        ],
                    },
                    receivedAssets: {
                        caller: {
                            address: 'EQB123',
                            blockchainType: BlockchainType.TAC,
                        },
                        target: {
                            address: 'EQB123',
                            blockchainType: BlockchainType.TON,
                        },
                        transactionHash: {
                            hash: '0xabc',
                            blockchainType: BlockchainType.TON,
                        },
                        assetMovements: [
                            {
                                assetType: AssetType.FT,
                                tvmAddress: 'EQB123',
                                evmAddress: '0x456',
                                amount: '999000',
                                tokenId: null,
                            },
                        ],
                    },
                },
                [StageName.COLLECTED_IN_TAC]: {
                    exists: true,
                    stageData: {
                        success: true,
                        timestamp: Date.now(),
                        transactions: null,
                        note: null,
                    },
                },
                [StageName.INCLUDED_IN_TAC_CONSENSUS]: {
                    exists: true,
                    stageData: {
                        success: true,
                        timestamp: Date.now(),
                        transactions: null,
                        note: null,
                    },
                },
                [StageName.EXECUTED_IN_TAC]: {
                    exists: true,
                    stageData: {
                        success: true,
                        timestamp: Date.now(),
                        transactions: null,
                        note: null,
                    },
                },
                [StageName.COLLECTED_IN_TON]: {
                    exists: false,
                    stageData: null,
                },
                [StageName.INCLUDED_IN_TON_CONSENSUS]: {
                    exists: false,
                    stageData: null,
                },
                [StageName.EXECUTED_IN_TON]: {
                    exists: false,
                    stageData: null,
                },
            };

            const stageProfilings: ExecutionStagesByOperationId = {
                [operationId]: expectedStages,
            };

            mockClients[0].getStageProfilings.mockResolvedValue(stageProfilings);

            const result = await operationTracker.getStageProfiling(operationId);

            expect(result).toEqual(expectedStages);
            expect(mockClients[0].getStageProfilings).toHaveBeenCalledWith([operationId]);
        });

        it('should throw error if no stage profiling data found', async () => {
            const operationId = 'op123';
            const stageProfilings: ExecutionStagesByOperationId = {};

            mockClients[0].getStageProfilings.mockResolvedValue(stageProfilings);

            await expect(operationTracker.getStageProfiling(operationId)).rejects.toThrow();
            expect(mockLogger.warn).toHaveBeenCalledWith(`No stageProfiling data for operationId=${operationId}`);
        });
    });

    describe('getOperationStatus', () => {
        it('should successfully get operation status', async () => {
            const operationId = 'op123';
            const expectedStatus: StatusInfo = {
                stage: StageName.EXECUTED_IN_TAC,
                success: true,
                timestamp: Date.now(),
                transactions: null,
                note: null,
            };

            const operationStatuses: StatusInfosByOperationId = {
                [operationId]: expectedStatus,
            };

            mockClients[0].getOperationStatuses.mockResolvedValue(operationStatuses);

            const result = await operationTracker.getOperationStatus(operationId);

            expect(result).toEqual(expectedStatus);
            expect(mockClients[0].getOperationStatuses).toHaveBeenCalledWith([operationId]);
        });

        it('should throw error if no operation status found', async () => {
            const operationId = 'op123';
            const operationStatuses: StatusInfosByOperationId = {};

            mockClients[0].getOperationStatuses.mockResolvedValue(operationStatuses);

            await expect(operationTracker.getOperationStatus(operationId)).rejects.toThrow();
            expect(mockLogger.warn).toHaveBeenCalledWith(`No operation status for operationId=${operationId}`);
        });
    });

    describe('getSimplifiedOperationStatus', () => {
        it('should return OPERATION_ID_NOT_FOUND when operation ID is empty', async () => {
            mockClients[0].getOperationId.mockResolvedValue('');

            const result = await operationTracker.getSimplifiedOperationStatus(sampleTransactionLinker);

            expect(result).toBe(SimplifiedStatuses.OPERATION_ID_NOT_FOUND);
            expect(mockLogger.warn).toHaveBeenCalledWith('Operation ID not found');
        });

        it('should return PENDING for pending operation type', async () => {
            const operationId = 'op123';
            mockClients[0].getOperationId.mockResolvedValue(operationId);
            mockClients[0].getOperationType.mockResolvedValue(OperationType.PENDING);

            const result = await operationTracker.getSimplifiedOperationStatus(sampleTransactionLinker);

            expect(result).toBe(SimplifiedStatuses.PENDING);
        });

        it('should return PENDING for unknown operation type', async () => {
            const operationId = 'op123';
            mockClients[0].getOperationId.mockResolvedValue(operationId);
            mockClients[0].getOperationType.mockResolvedValue(OperationType.UNKNOWN);

            const result = await operationTracker.getSimplifiedOperationStatus(sampleTransactionLinker);

            expect(result).toBe(SimplifiedStatuses.PENDING);
        });

        it('should return FAILED for rollback operation type', async () => {
            const operationId = 'op123';
            mockClients[0].getOperationId.mockResolvedValue(operationId);
            mockClients[0].getOperationType.mockResolvedValue(OperationType.ROLLBACK);

            const result = await operationTracker.getSimplifiedOperationStatus(sampleTransactionLinker);

            expect(result).toBe(SimplifiedStatuses.FAILED);
        });

        it('should return SUCCESSFUL for completed operation types', async () => {
            const operationId = 'op123';
            mockClients[0].getOperationId.mockResolvedValue(operationId);
            mockClients[0].getOperationType.mockResolvedValue(OperationType.TON_TAC_TON);

            const result = await operationTracker.getSimplifiedOperationStatus(sampleTransactionLinker);

            expect(result).toBe(SimplifiedStatuses.SUCCESSFUL);
        });
    });

    describe('getStageProfilings', () => {
        it('should successfully get multiple stage profilings', async () => {
            const operationIds = ['op1', 'op2'];
            const expectedResult: ExecutionStagesByOperationId = {
                op1: {} as ExecutionStages,
                op2: {} as ExecutionStages,
            };

            mockClients[0].getStageProfilings.mockResolvedValue(expectedResult);

            const result = await operationTracker.getStageProfilings(operationIds);

            expect(result).toEqual(expectedResult);
            expect(mockClients[0].getStageProfilings).toHaveBeenCalledWith(operationIds, 100);
        });
    });

    describe('convertCurrency', () => {
        it('should successfully convert currency using first client', async () => {
            const params: ConvertCurrencyParams = {
                value: 123n,
                currency: CurrencyType.TON,
            };
            const expected: ConvertedCurrencyResult = {
                spotValue: 100n,
                emaValue: 200n,
                decimals: 9,
                currency: CurrencyType.TON,
                tacPrice: { spot: 1n, ema: 2n, decimals: 18 },
                tonPrice: { spot: 3n, ema: 4n, decimals: 18 },
            } as unknown as ConvertedCurrencyResult;

            mockClients[0].convertCurrency.mockResolvedValue(expected);

            const result = await operationTracker.convertCurrency(params);

            expect(result).toBe(expected);
            expect(mockClients[0].convertCurrency).toHaveBeenCalledWith(params);
            expect(mockLogger.debug).toHaveBeenCalledWith(
                `Converting currency: ${JSON.stringify(params, (k, v) => (typeof v === 'bigint' ? v.toString() : v))}`,
            );
            expect(mockLogger.debug).toHaveBeenCalledWith('Conversion result retrieved successfully');
        });

        it('should retry on second client if first fails', async () => {
            const params: ConvertCurrencyParams = {
                value: 999n,
                currency: CurrencyType.TAC,
            };
            const expected = {
                spotValue: 1n,
                emaValue: 2n,
                decimals: 18,
                currency: CurrencyType.TAC,
                tacPrice: { spot: 10n, ema: 11n, decimals: 18 },
                tonPrice: { spot: 12n, ema: 13n, decimals: 18 },
            } as unknown as ConvertedCurrencyResult;

            mockClients[0].convertCurrency.mockRejectedValue(new Error('Network error'));
            mockClients[1].convertCurrency.mockResolvedValue(expected);

            const result = await operationTracker.convertCurrency(params);

            expect(result).toBe(expected);
            expect(mockClients[0].convertCurrency).toHaveBeenCalledWith(params);
            expect(mockClients[1].convertCurrency).toHaveBeenCalledWith(params);
            expect(mockLogger.warn).toHaveBeenCalledWith('Failed to convert currency using one of the endpoints');
        });

        it('should throw error if all endpoints fail', async () => {
            const params: ConvertCurrencyParams = {
                value: 1n,
                currency: CurrencyType.TON,
            };
            const error = new Error('Network error');

            mockClients[0].convertCurrency.mockRejectedValue(error);
            mockClients[1].convertCurrency.mockRejectedValue(error);

            await expect(operationTracker.convertCurrency(params)).rejects.toThrow();
            expect(mockLogger.error).toHaveBeenCalledWith('All endpoints failed to convert currency');
        });

        it('should support waitOptions and still return result', async () => {
            const params: ConvertCurrencyParams = {
                value: 123n,
                currency: CurrencyType.TON,
            };
            const expected = {
                spotValue: 7n,
                emaValue: 8n,
                decimals: 9,
                currency: CurrencyType.TON,
                tacPrice: { spot: 9n, ema: 10n, decimals: 18 },
                tonPrice: { spot: 11n, ema: 12n, decimals: 18 },
            } as unknown as ConvertedCurrencyResult;

            mockClients[0].convertCurrency.mockResolvedValue(expected);

            const waitOptions: WaitOptions<ConvertedCurrencyResult> = {
                timeout: 1000,
                maxAttempts: 1,
                delay: 10,
                successCheck: (res) => !!res,
            };

            const result = await operationTracker.convertCurrency(params, waitOptions);
            expect(result).toBe(expected);
            expect(mockClients[0].convertCurrency).toHaveBeenCalledTimes(1);
        });
    });

    describe('getOperationStatuses', () => {
        it('should successfully get multiple operation statuses', async () => {
            const operationIds = ['op1', 'op2'];
            const expectedResult: StatusInfosByOperationId = {
                op1: {} as StatusInfo,
                op2: {} as StatusInfo,
            };

            mockClients[0].getOperationStatuses.mockResolvedValue(expectedResult);

            const result = await operationTracker.getOperationStatuses(operationIds);

            expect(result).toEqual(expectedResult);
            expect(mockClients[0].getOperationStatuses).toHaveBeenCalledWith(operationIds, 100);
        });
    });

    describe('getOperationIdByTransactionHash', () => {
        it('should successfully get operation ID by transaction hash', async () => {
            const transactionHash = '0x123abc';
            const expectedId = 'op456';

            mockClients[0].getOperationIdByTransactionHash.mockResolvedValue(expectedId);

            const result = await operationTracker.getOperationIdByTransactionHash(transactionHash);

            expect(result).toBe(expectedId);
            expect(mockClients[0].getOperationIdByTransactionHash).toHaveBeenCalledWith(transactionHash);
            expect(mockLogger.debug).toHaveBeenCalledWith(`Getting operation ID for transactionHash: "${transactionHash}"`);
            expect(mockLogger.debug).toHaveBeenCalledWith('Operation ID retrieved successfully');
        });

        it('should handle empty operation ID by transaction hash', async () => {
            const transactionHash = '0x123abc';

            mockClients[0].getOperationIdByTransactionHash.mockResolvedValue('');

            const result = await operationTracker.getOperationIdByTransactionHash(transactionHash);

            expect(result).toBe('');
            expect(mockLogger.debug).toHaveBeenCalledWith('Operation ID does not exist');
        });

        it('should retry on second client if first fails', async () => {
            const transactionHash = '0x123abc';
            const expectedId = 'op456';

            mockClients[0].getOperationIdByTransactionHash.mockRejectedValue(new Error('Network error'));
            mockClients[1].getOperationIdByTransactionHash.mockResolvedValue(expectedId);

            const result = await operationTracker.getOperationIdByTransactionHash(transactionHash);

            expect(result).toBe(expectedId);
            expect(mockClients[0].getOperationIdByTransactionHash).toHaveBeenCalledWith(transactionHash);
            expect(mockClients[1].getOperationIdByTransactionHash).toHaveBeenCalledWith(transactionHash);
            expect(mockLogger.warn).toHaveBeenCalledWith('Failed to get OperationId by transactionHash using one of the endpoints');
        });

        it('should throw error if all endpoints fail', async () => {
            const transactionHash = '0x123abc';
            const error = new Error('Network error');

            mockClients[0].getOperationIdByTransactionHash.mockRejectedValue(error);
            mockClients[1].getOperationIdByTransactionHash.mockRejectedValue(error);

            await expect(operationTracker.getOperationIdByTransactionHash(transactionHash)).rejects.toThrow();
            expect(mockLogger.error).toHaveBeenCalledWith('All endpoints failed to get operation id by transactionHash');
        });

        it('should use waitUntilSuccess when wait options provided', async () => {
            const transactionHash = '0x123abc';
            const expectedId = 'op456';
            const waitOptions = { timeout: 5000, maxAttempts: 3, delay: 500 };

            mockClients[0].getOperationIdByTransactionHash.mockResolvedValue(expectedId);

            const result = await operationTracker.getOperationIdByTransactionHash(transactionHash, waitOptions);

            expect(result).toBe(expectedId);
        });
    });

    describe('simulateTACMessage', () => {
        it('should successfully simulate TAC message', async () => {
            const params = {
                tacCallParams: {
                    arguments: '0xabcdef',
                    methodName: 'transfer',
                    target: '0x1234567890123456789012345678901234567890',
                },
                shardsKey: '12345',
                tonAssets: [
                    {
                        amount: '1000000000',
                        tokenAddress: 'EQCsQSo54ajAorOfDUAM-RPdDJgs0obqyrNSEtvbjB7hh2oK',
                        assetType: AssetType.FT,
                    },
                ],
                tonCaller: 'EQCsQSo54ajAorOfDUAM-RPdDJgs0obqyrNSEtvbjB7hh2oK',
            };
            const expectedResult = {
                estimatedGas: 21000n,
                feeParams: {
                    currentBaseFee: '20000000000',
                    isEip1559: true,
                    suggestedGasPrice: '25000000000',
                    suggestedGasTip: '2000000000',
                },
                message: 'Simulation successful',
                outMessages: null,
                simulationError: '',
                simulationStatus: true,
                suggestedTonExecutionFee: '5000000',
                suggestedTacExecutionFee: '3000000',
                debugInfo: {
                    from: '0x123',
                    to: '0x456',
                    callData: '0xabcdef',
                    blockNumber: 12345,
                },
            };

            mockClients[0].simulateTACMessage.mockResolvedValue(expectedResult);

            const result = await operationTracker.simulateTACMessage(params);

            expect(result).toBe(expectedResult);
            expect(mockClients[0].simulateTACMessage).toHaveBeenCalledWith(params);
            expect(mockLogger.debug).toHaveBeenCalledWith(`Simulating TAC message: ${JSON.stringify(params, (k, v) => typeof v === 'bigint' ? v.toString() : v)}`);
            expect(mockLogger.debug).toHaveBeenCalledWith('Simulation result retrieved successfully');
        });

        it('should retry on second client if first fails', async () => {
            const params = {
                tacCallParams: {
                    arguments: '0xabcdef',
                    methodName: 'transfer',
                    target: '0x1234567890123456789012345678901234567890',
                },
                shardsKey: '12345',
                tonAssets: [
                    {
                        amount: '1000000000',
                        tokenAddress: 'EQCsQSo54ajAorOfDUAM-RPdDJgs0obqyrNSEtvbjB7hh2oK',
                        assetType: AssetType.FT,
                    },
                ],
                tonCaller: 'EQCsQSo54ajAorOfDUAM-RPdDJgs0obqyrNSEtvbjB7hh2oK',
            };
            const expectedResult = {
                estimatedGas: 21000n,
                feeParams: {
                    currentBaseFee: '20000000000',
                    isEip1559: true,
                    suggestedGasPrice: '25000000000',
                    suggestedGasTip: '2000000000',
                },
                message: 'Simulation successful',
                outMessages: null,
                simulationError: '',
                simulationStatus: true,
                suggestedTonExecutionFee: '5000000',
                suggestedTacExecutionFee: '3000000',
                debugInfo: {
                    from: '0x123',
                    to: '0x456',
                    callData: '0xabcdef',
                    blockNumber: 12345,
                },
            };

            mockClients[0].simulateTACMessage.mockRejectedValue(new Error('Simulation error'));
            mockClients[1].simulateTACMessage.mockResolvedValue(expectedResult);

            const result = await operationTracker.simulateTACMessage(params);

            expect(result).toBe(expectedResult);
            expect(mockClients[0].simulateTACMessage).toHaveBeenCalledWith(params);
            expect(mockClients[1].simulateTACMessage).toHaveBeenCalledWith(params);
            expect(mockLogger.warn).toHaveBeenCalledWith('Failed to simulate TAC message using one of the endpoints');
        });

        it('should throw error if all endpoints fail', async () => {
            const params = {
                tacCallParams: {
                    arguments: '0xabcdef',
                    methodName: 'transfer',
                    target: '0x1234567890123456789012345678901234567890',
                },
                shardsKey: '12345',
                tonAssets: [
                    {
                        amount: '1000000000',
                        tokenAddress: 'EQCsQSo54ajAorOfDUAM-RPdDJgs0obqyrNSEtvbjB7hh2oK',
                        assetType: AssetType.FT,
                    },
                ],
                tonCaller: 'EQCsQSo54ajAorOfDUAM-RPdDJgs0obqyrNSEtvbjB7hh2oK',
            };
            const error = new Error('Simulation error');

            mockClients[0].simulateTACMessage.mockRejectedValue(error);
            mockClients[1].simulateTACMessage.mockRejectedValue(error);

            await expect(operationTracker.simulateTACMessage(params)).rejects.toThrow();
            expect(mockLogger.error).toHaveBeenCalledWith('All endpoints failed to simulate TAC message');
        });

        it('should use waitUntilSuccess when wait options provided', async () => {
            const params = {
                tacCallParams: {
                    arguments: '0xabcdef',
                    methodName: 'transfer',
                    target: '0x1234567890123456789012345678901234567890',
                },
                shardsKey: '12345',
                tonAssets: [
                    {
                        amount: '1000000000',
                        tokenAddress: 'EQCsQSo54ajAorOfDUAM-RPdDJgs0obqyrNSEtvbjB7hh2oK',
                        assetType: AssetType.FT,
                    },
                ],
                tonCaller: 'EQCsQSo54ajAorOfDUAM-RPdDJgs0obqyrNSEtvbjB7hh2oK',
            };
            const expectedResult = {
                estimatedGas: 21000n,
                feeParams: {
                    currentBaseFee: '20000000000',
                    isEip1559: true,
                    suggestedGasPrice: '25000000000',
                    suggestedGasTip: '2000000000',
                },
                message: 'Simulation successful',
                outMessages: null,
                simulationError: '',
                simulationStatus: true,
                suggestedTonExecutionFee: '5000000',
                suggestedTacExecutionFee: '3000000',
                debugInfo: {
                    from: '0x123',
                    to: '0x456',
                    callData: '0xabcdef',
                    blockNumber: 12345,
                },
            };
            const waitOptions = { timeout: 5000, maxAttempts: 3, delay: 500 };

            mockClients[0].simulateTACMessage.mockResolvedValue(expectedResult);

            const result = await operationTracker.simulateTACMessage(params, waitOptions);

            expect(result).toBe(expectedResult);
        });
    });

    describe('getTVMExecutorFee', () => {
        it('should successfully get TVM executor fee', async () => {
            const params = {
                feeSymbol: 'TON',
                tonAssets: [
                    {
                        amount: '1000000000',
                        tokenAddress: 'EQB123',
                        assetType: AssetType.FT,
                    },
                ],
                tvmValidExecutors: ['EQB456', 'EQB789'],
            };
            const expectedResult = {
                inTAC: '5000000',
                inTON: '3000000',
            };

            mockClients[0].getTVMExecutorFee.mockResolvedValue(expectedResult);

            const result = await operationTracker.getTVMExecutorFee(params);

            expect(result).toBe(expectedResult);
            expect(mockClients[0].getTVMExecutorFee).toHaveBeenCalledWith(params);
            expect(mockLogger.debug).toHaveBeenCalledWith(`get TVM executor fee: ${JSON.stringify(params, (k, v) => typeof v === 'bigint' ? v.toString() : v)}`);
            expect(mockLogger.debug).toHaveBeenCalledWith('Suggested TVM executor fee retrieved successfully');
        });

        it('should retry on second client if first fails', async () => {
            const params = {
                feeSymbol: 'TON',
                tonAssets: [
                    {
                        amount: '1000000000',
                        tokenAddress: 'EQB123',
                        assetType: AssetType.FT,
                    },
                ],
                tvmValidExecutors: ['EQB456', 'EQB789'],
            };
            const expectedResult = {
                inTAC: '5000000',
                inTON: '3000000',
            };

            mockClients[0].getTVMExecutorFee.mockRejectedValue(new Error('Fee calculation error'));
            mockClients[1].getTVMExecutorFee.mockResolvedValue(expectedResult);

            const result = await operationTracker.getTVMExecutorFee(params);

            expect(result).toBe(expectedResult);
            expect(mockClients[0].getTVMExecutorFee).toHaveBeenCalledWith(params);
            expect(mockClients[1].getTVMExecutorFee).toHaveBeenCalledWith(params);
            expect(mockLogger.warn).toHaveBeenCalledWith('Failed to get TVM executor fee using one of the endpoints');
        });

        it('should throw error if all endpoints fail', async () => {
            const params = {
                feeSymbol: 'TON',
                tonAssets: [
                    {
                        amount: '1000000000',
                        tokenAddress: 'EQB123',
                        assetType: AssetType.FT,
                    },
                ],
                tvmValidExecutors: ['EQB456', 'EQB789'],
            };
            const error = new Error('Fee calculation error');

            mockClients[0].getTVMExecutorFee.mockRejectedValue(error);
            mockClients[1].getTVMExecutorFee.mockRejectedValue(error);

            await expect(operationTracker.getTVMExecutorFee(params)).rejects.toThrow();
            expect(mockLogger.error).toHaveBeenCalledWith('All endpoints failed to get TVM executor fee');
        });

        it('should use waitUntilSuccess when wait options provided', async () => {
            const params = {
                feeSymbol: 'TON',
                tonAssets: [
                    {
                        amount: '1000000000',
                        tokenAddress: 'EQB123',
                        assetType: AssetType.FT,
                    },
                ],
                tvmValidExecutors: ['EQB456', 'EQB789'],
            };
            const expectedResult = {
                inTAC: '5000000',
                inTON: '3000000',
            };
            const waitOptions = { timeout: 5000, maxAttempts: 3, delay: 500 };

            mockClients[0].getTVMExecutorFee.mockResolvedValue(expectedResult);

            const result = await operationTracker.getTVMExecutorFee(params, waitOptions);

            expect(result).toBe(expectedResult);
        });
    });
});
