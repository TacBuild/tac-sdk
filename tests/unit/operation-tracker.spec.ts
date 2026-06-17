import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Address, beginCell, external, storeMessage } from '@ton/ton';

import { testnet } from '../../artifacts';
import {
    Configuration,
    ContractOpener,
    FetchError,
    ILiteSequencerClient,
    ILiteSequencerClientFactory,
    IToncenterV3Indexer,
    OperationTracker,
} from '../../src';
import {
    AssetType,
    BlockchainType,
    ConvertCurrencyParams,
    ConvertedCurrencyResult,
    CurrencyType,
    ExecutionStages,
    ExecutionStagesByOperationId,
    ExecutionStagesV2,
    ExecutionStagesV2ByOperationId,
    ILogger,
    Network,
    OperationExecutionStatus,
    OperationIdsByShardsKey,
    OperationIdWithLogIndex,
    OperationType,
    OperationTypeV2Info,
    SimplifiedStatuses,
    StageName,
    StatusInfo,
    StatusInfosByOperationId,
    TokenSymbol,
    TransactionLinker,
    WaitOptions,
} from '../../src';
import { convertCurrencyNegativeOrZeroValueError } from '../../src/errors/instances';
import * as Utils from '../../src/sdk/Utils';
import { InternalTACParams, InternalTONParams } from '../../src/structs/InternalStruct';

// Mock implementations
class MockLogger implements ILogger {
    debug = jest.fn();
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
}

class MockLiteSequencerClient implements ILiteSequencerClient {
    constructor(readonly endpoint: string) {}

    getOperationType = jest.fn<ILiteSequencerClient['getOperationType']>();
    getOperationTypeV2 = jest.fn<ILiteSequencerClient['getOperationTypeV2']>();
    getOperationId = jest.fn<ILiteSequencerClient['getOperationId']>();
    getOperationIdByTacTransactionHash = jest.fn<ILiteSequencerClient['getOperationIdByTacTransactionHash']>();
    getOperationIdByTransactionHash = jest.fn<ILiteSequencerClient['getOperationIdByTransactionHash']>();
    getOperationIdByTonTransactionHash = jest.fn<ILiteSequencerClient['getOperationIdByTonTransactionHash']>();
    getOperationIdsByShardsKeys = jest.fn<ILiteSequencerClient['getOperationIdsByShardsKeys']>();
    getStageProfilings = jest.fn<ILiteSequencerClient['getStageProfilings']>();
    getStageProfilingsV2 = jest.fn<ILiteSequencerClient['getStageProfilingsV2']>();
    getOperationStatuses = jest.fn<ILiteSequencerClient['getOperationStatuses']>();
    convertCurrency = jest.fn<ILiteSequencerClient['convertCurrency']>();
    simulateTACMessage = jest.fn<ILiteSequencerClient['simulateTACMessage']>();
    getTVMExecutorFee = jest.fn<ILiteSequencerClient['getTVMExecutorFee']>();
}

class MockLiteSequencerClientFactory implements ILiteSequencerClientFactory {
    private clients: MockLiteSequencerClient[] = [];

    createClients(endpoints: string[]): ILiteSequencerClient[] {
        this.clients = endpoints.map((endpoint) => new MockLiteSequencerClient(endpoint));
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
    const liteSequencerEndpoints = ['http://localhost:3000', 'http://localhost:3001'];
    const createTrackerConfig = (TONParams: Partial<InternalTONParams> = {}) =>
        new Configuration(
            Network.TESTNET,
            testnet,
            TONParams as InternalTONParams,
            {} as InternalTACParams,
            liteSequencerEndpoints,
            mockLogger,
        );

    beforeEach(() => {
        mockLogger = new MockLogger();
        mockClientFactory = new MockLiteSequencerClientFactory();
        operationTracker = new OperationTracker(createTrackerConfig(), mockLogger, mockClientFactory);

        mockClients = mockClientFactory.getClients();
    });

    const immediateWaitOptions = {
        timeout: 1000,
        maxAttempts: 1,
        delay: 1,
    };

    describe('getOperationType', () => {
        it('should successfully get operation type', async () => {
            const operationId = 'op123';
            const expectedType = OperationType.TON_TAC_TON;

            mockClients[0].getOperationType.mockResolvedValue(expectedType);

            const result = await operationTracker.getOperationType(operationId);

            expect(result).toBe(expectedType);
            expect(mockClients[0].getOperationType).toHaveBeenCalledWith(operationId);
            expect(mockLogger.debug).toHaveBeenCalledWith(
                `[OperationTracker: Getting operation type for "${operationId}"] Success (attempt 1/30)`,
            );
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
            expect(mockLogger.warn).not.toHaveBeenCalled();
        });

        it('should throw error if all endpoints fail', async () => {
            const operationId = 'op123';
            const error = new Error('Network error');

            mockClients[0].getOperationType.mockRejectedValue(error);
            mockClients[1].getOperationType.mockRejectedValue(error);

            await expect(operationTracker.getOperationType(operationId, immediateWaitOptions)).rejects.toThrow();
            expect(mockLogger.debug).toHaveBeenCalledWith(
                '[OperationTracker: Getting operation type for "op123"] Max attempts (1) reached',
            );
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

    describe('getOperationTypeV2', () => {
        it('should successfully get operation type v2', async () => {
            const operationId = 'op123';
            const expectedType: OperationTypeV2Info = {
                operationType: OperationType.TON_TAC_TON,
                finalized: true,
            };

            mockClients[0].getOperationTypeV2.mockResolvedValue(expectedType);

            const result = await operationTracker.getOperationTypeV2(operationId);

            expect(result).toEqual(expectedType);
            expect(mockClients[0].getOperationTypeV2).toHaveBeenCalledWith(operationId);
            expect(mockLogger.debug).toHaveBeenCalledWith(
                `[OperationTracker: Getting operation type v2 for "${operationId}"] Success (attempt 1/30)`,
            );
        });

        it('should retry v2 operation type on second client if first fails', async () => {
            const operationId = 'op123';
            const expectedType: OperationTypeV2Info = {
                operationType: OperationType.TON_TAC,
                finalized: false,
            };

            mockClients[0].getOperationTypeV2.mockRejectedValue(new Error('Network error'));
            mockClients[1].getOperationTypeV2.mockResolvedValue(expectedType);

            const result = await operationTracker.getOperationTypeV2(operationId);

            expect(result).toEqual(expectedType);
            expect(mockClients[0].getOperationTypeV2).toHaveBeenCalledWith(operationId);
            expect(mockClients[1].getOperationTypeV2).toHaveBeenCalledWith(operationId);
        });
    });

    describe('getOperationId', () => {
        it('should successfully get operation ID', async () => {
            const expectedId = 'op123';

            mockClients[0].getOperationId.mockResolvedValue(expectedId);

            const result = await operationTracker.getOperationId(sampleTransactionLinker);

            expect(result).toBe(expectedId);
            expect(mockClients[0].getOperationId).toHaveBeenCalledWith(sampleTransactionLinker);
            expect(mockLogger.debug).toHaveBeenCalledWith(
                `[OperationTracker: Getting operation ID by transaction linker ${JSON.stringify(sampleTransactionLinker)}] Success (attempt 1/30)`,
            );
        });

        it('should handle empty operation ID', async () => {
            mockClients[0].getOperationId.mockResolvedValue('');

            const result = await operationTracker.getOperationId(sampleTransactionLinker);

            expect(result).toBe('');
            expect(mockLogger.debug).toHaveBeenCalledWith(
                `[OperationTracker: Getting operation ID by transaction linker ${JSON.stringify(sampleTransactionLinker)}] Success (attempt 1/30)`,
            );
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

            await expect(operationTracker.getStageProfiling(operationId, immediateWaitOptions)).rejects.toThrow(
                'All endpoints failed',
            );
            expect(mockLogger.debug).toHaveBeenCalledWith(
                `[OperationTracker: Getting stage profiling for operation ${operationId}] Max attempts (1) reached`,
            );
        });
    });

    describe('getStageProfilingV2', () => {
        it('should successfully get stage profiling v2', async () => {
            const operationId = 'op123';
            const expectedStages: ExecutionStagesV2 = {
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
                    sentAssets: null,
                    receivedAssets: null,
                },
                finalized: true,
                status: OperationExecutionStatus.SUCCESS,
                rollback: false,
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

            const stageProfilings: ExecutionStagesV2ByOperationId = {
                [operationId]: expectedStages,
            };

            mockClients[0].getStageProfilingsV2.mockResolvedValue(stageProfilings);

            const result = await operationTracker.getStageProfilingV2(operationId);

            expect(result).toEqual(expectedStages);
            expect(mockClients[0].getStageProfilingsV2).toHaveBeenCalledWith([operationId]);
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
            expect(mockLogger.debug).not.toHaveBeenCalledWith('Operation status retrieved successfully');
            expect(mockLogger.debug).toHaveBeenCalledWith(
                `operation status resolved stage=${StageName.EXECUTED_IN_TAC} success=true`,
            );
        });

        it('should throw error if no operation status found', async () => {
            const operationId = 'op123';
            const operationStatuses: StatusInfosByOperationId = {};

            mockClients[0].getOperationStatuses.mockResolvedValue(operationStatuses);

            await expect(operationTracker.getOperationStatus(operationId, immediateWaitOptions)).rejects.toThrow(
                'All endpoints failed',
            );
            expect(mockLogger.debug).toHaveBeenCalledWith(
                `[OperationTracker: Getting operation status for "${operationId}"] Max attempts (1) reached`,
            );
        });

        it('should log pending one-liner for intermediate status while waiting', async () => {
            const operationId = 'op123';
            const pendingStatus: StatusInfo = {
                stage: StageName.INCLUDED_IN_TON_CONSENSUS,
                success: true,
                timestamp: Date.now(),
                transactions: [
                    {
                        hash: '0x69d97176890b6968837c20ff9fff36d8791e5108cb0a8bb366da13db6bd556ab',
                        blockchainType: BlockchainType.TON,
                    },
                ],
                note: null,
            };
            const finalStatus: StatusInfo = {
                stage: StageName.EXECUTED_IN_TON,
                success: true,
                timestamp: Date.now(),
                transactions: [
                    {
                        hash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                        blockchainType: BlockchainType.TON,
                    },
                ],
                note: null,
            };

            mockClients[0].getOperationStatuses
                .mockResolvedValueOnce({ [operationId]: pendingStatus })
                .mockResolvedValueOnce({ [operationId]: finalStatus });

            const waitOptions: WaitOptions<StatusInfo> = {
                timeout: 1000,
                maxAttempts: 5,
                delay: 1,
                logger: mockLogger,
                successCheck: (status) => status.stage === StageName.EXECUTED_IN_TON,
            };

            const result = await operationTracker.getOperationStatus(operationId, waitOptions);
            expect(result).toEqual(finalStatus);
            expect(mockLogger.debug).toHaveBeenCalledWith(
                '[OperationTracker: Getting operation status for "op123"] pending attempt=1/5 stage=includedInTONConsensus success=true tx=0x69d97176890b6968837c20ff9fff36d8791e5108cb0a8bb366da13db6bd556ab retry_in=1ms',
            );
            expect(mockLogger.debug).toHaveBeenCalledWith(
                `operation status resolved stage=${StageName.EXECUTED_IN_TON} success=true`,
            );
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
            expect(mockClients[0].getOperationType).toHaveBeenCalledWith(operationId);
        });

        it('should return PENDING for unknown operation type', async () => {
            const operationId = 'op123';
            mockClients[0].getOperationId.mockResolvedValue(operationId);
            mockClients[0].getOperationType.mockResolvedValue(OperationType.UNKNOWN);

            const result = await operationTracker.getSimplifiedOperationStatus(sampleTransactionLinker);

            expect(result).toBe(SimplifiedStatuses.PENDING);
            expect(mockClients[0].getOperationType).toHaveBeenCalledWith(operationId);
        });

        it('should return FAILED for rollback operation type', async () => {
            const operationId = 'op123';
            mockClients[0].getOperationId.mockResolvedValue(operationId);
            mockClients[0].getOperationType.mockResolvedValue(OperationType.ROLLBACK);

            const result = await operationTracker.getSimplifiedOperationStatus(sampleTransactionLinker);

            expect(result).toBe(SimplifiedStatuses.FAILED);
            expect(mockClients[0].getOperationType).toHaveBeenCalledWith(operationId);
        });

        it('should return SUCCESSFUL for TON-TAC operation type', async () => {
            const operationId = 'op123';
            mockClients[0].getOperationId.mockResolvedValue(operationId);
            mockClients[0].getOperationType.mockResolvedValue(OperationType.TON_TAC);

            const result = await operationTracker.getSimplifiedOperationStatus(sampleTransactionLinker);

            expect(result).toBe(SimplifiedStatuses.SUCCESSFUL);
            expect(mockClients[0].getOperationType).toHaveBeenCalledWith(operationId);
        });

        it('should return SUCCESSFUL for TON-TAC-TON operation type', async () => {
            const operationId = 'op123';
            mockClients[0].getOperationId.mockResolvedValue(operationId);
            mockClients[0].getOperationType.mockResolvedValue(OperationType.TON_TAC_TON);

            const result = await operationTracker.getSimplifiedOperationStatus(sampleTransactionLinker);

            expect(result).toBe(SimplifiedStatuses.SUCCESSFUL);
            expect(mockClients[0].getOperationType).toHaveBeenCalledWith(operationId);
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
        it('should throw error if value negative or zero', async () => {
            let params: ConvertCurrencyParams = {
                value: 0n,
                currency: CurrencyType.TON,
            };

            await expect(operationTracker.convertCurrency(params)).rejects.toThrow(
                convertCurrencyNegativeOrZeroValueError,
            );

            params = {
                value: -2n,
                currency: CurrencyType.TON,
            };

            await expect(operationTracker.convertCurrency(params)).rejects.toThrow(
                convertCurrencyNegativeOrZeroValueError,
            );
        });

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
                `[OperationTracker: Converting currency ${JSON.stringify(params, (k, v) => (typeof v === 'bigint' ? v.toString() : v))}] Success (attempt 1/30)`,
            );
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
            expect(mockLogger.warn).not.toHaveBeenCalled();
        });

        it('should throw error if all endpoints fail', async () => {
            const params: ConvertCurrencyParams = {
                value: 1n,
                currency: CurrencyType.TON,
            };
            const error = new Error('Network error');

            mockClients[0].convertCurrency.mockRejectedValue(error);
            mockClients[1].convertCurrency.mockRejectedValue(error);

            await expect(operationTracker.convertCurrency(params, immediateWaitOptions)).rejects.toThrow();
            expect(mockLogger.debug).toHaveBeenCalledWith(
                `[OperationTracker: Converting currency ${JSON.stringify(params, (k, v) => (typeof v === 'bigint' ? v.toString() : v))}] Max attempts (1) reached`,
            );
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
            expect(mockLogger.debug).toHaveBeenCalledWith(
                `[OperationTracker: Getting operation ID by transaction hash "${transactionHash}"] Success (attempt 1/30)`,
            );
        });

        it('should handle empty operation ID by transaction hash', async () => {
            const transactionHash = '0x123abc';

            mockClients[0].getOperationIdByTransactionHash.mockResolvedValue('');

            const result = await operationTracker.getOperationIdByTransactionHash(transactionHash);

            expect(result).toBe('');
            expect(mockLogger.debug).toHaveBeenCalledWith(
                `[OperationTracker: Getting operation ID by transaction hash "${transactionHash}"] Success (attempt 1/30)`,
            );
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
            expect(mockLogger.warn).not.toHaveBeenCalled();
        });

        it('should throw error if all endpoints fail', async () => {
            const transactionHash = '0x123abc';
            const error = new Error('Network error');

            mockClients[0].getOperationIdByTransactionHash.mockRejectedValue(error);
            mockClients[1].getOperationIdByTransactionHash.mockRejectedValue(error);

            await expect(
                operationTracker.getOperationIdByTransactionHash(transactionHash, immediateWaitOptions),
            ).rejects.toThrow();
            expect(mockLogger.debug).toHaveBeenCalledWith(
                `[OperationTracker: Getting operation ID by transaction hash "${transactionHash}"] Max attempts (1) reached`,
            );
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

    describe('getOperationIdByTacTransactionHash', () => {
        it('should successfully get TAC operation IDs with log indexes by transaction hash', async () => {
            const transactionHash = '0x123abc';
            const expectedIds: OperationIdWithLogIndex[] = [
                { operationId: 'op456', logIndex: 2 },
                { operationId: 'op789', logIndex: 7 },
            ];

            mockClients[0].getOperationIdByTacTransactionHash.mockResolvedValue(expectedIds);

            const result = await operationTracker.getOperationIdByTacTransactionHash(transactionHash);

            expect(result).toEqual(expectedIds);
            expect(mockClients[0].getOperationIdByTacTransactionHash).toHaveBeenCalledWith(transactionHash);
            expect(mockLogger.debug).toHaveBeenCalledWith(
                `[OperationTracker: Getting operation IDs by TAC transaction hash "${transactionHash}"] Success (attempt 1/30)`,
            );
        });

        it('should handle empty TAC operation id arrays', async () => {
            const transactionHash = '0x123abc';

            mockClients[0].getOperationIdByTacTransactionHash.mockResolvedValue([]);

            const result = await operationTracker.getOperationIdByTacTransactionHash(transactionHash);

            expect(result).toEqual([]);
            expect(mockLogger.debug).toHaveBeenCalledWith(
                `[OperationTracker: Getting operation IDs by TAC transaction hash "${transactionHash}"] Success (attempt 1/30)`,
            );
        });

        it('should retry on second client if first TAC route fails', async () => {
            const transactionHash = '0x123abc';
            const expectedIds: OperationIdWithLogIndex[] = [{ operationId: 'op456', logIndex: 2 }];

            mockClients[0].getOperationIdByTacTransactionHash.mockRejectedValue(new Error('Network error'));
            mockClients[1].getOperationIdByTacTransactionHash.mockResolvedValue(expectedIds);

            const result = await operationTracker.getOperationIdByTacTransactionHash(transactionHash);

            expect(result).toEqual(expectedIds);
            expect(mockClients[0].getOperationIdByTacTransactionHash).toHaveBeenCalledWith(transactionHash);
            expect(mockClients[1].getOperationIdByTacTransactionHash).toHaveBeenCalledWith(transactionHash);
        });

        it('should throw error if all TAC endpoints fail', async () => {
            const transactionHash = '0x123abc';
            const error = new Error('Network error');

            mockClients[0].getOperationIdByTacTransactionHash.mockRejectedValue(error);
            mockClients[1].getOperationIdByTacTransactionHash.mockRejectedValue(error);

            await expect(
                operationTracker.getOperationIdByTacTransactionHash(transactionHash, immediateWaitOptions),
            ).rejects.toThrow();
            expect(mockLogger.debug).toHaveBeenCalledWith(
                `[OperationTracker: Getting operation IDs by TAC transaction hash "${transactionHash}"] Max attempts (1) reached`,
            );
        });
    });

    describe('getOperationIdByTonTransactionHash', () => {
        const crossChainLayerAddress = '0:C8BA7D20AB6D96F4DD7F9574C9C4ED11A6DAC7EB6E48BAD58373052124978EB3';
        const cclTransactionHash = '+ux6QOo4uZtXAUcvXQDoTKZjPDiz6+4oJv9pODRAY1I=';
        const sequencerCclTransactionHash = '0xfaec7a40ea38b99b5701472f5d00e84ca6633c38b3ebee2826ff693834406352';

        const createIndexedTracker = () => {
            const clientFactory = new MockLiteSequencerClientFactory();
            const contractOpener = {
                open: ((src) => src as never) as ContractOpener['open'],
                getContractState: jest.fn<ContractOpener['getContractState']>(),
                closeConnections: jest.fn<NonNullable<ContractOpener['closeConnections']>>(),
                getTransactions: jest.fn<ContractOpener['getTransactions']>(),
                getTransactionByHash: jest.fn<ContractOpener['getTransactionByHash']>(),
                getTransactionByTxHash: jest.fn<ContractOpener['getTransactionByTxHash']>(),
                getTransactionByInMsgHash: jest.fn<ContractOpener['getTransactionByInMsgHash']>(),
                getTransactionByOutMsgHash: jest.fn<ContractOpener['getTransactionByOutMsgHash']>(),
                getAdjacentTransactions: jest.fn<ContractOpener['getAdjacentTransactions']>(),
                getAddressInformation: jest.fn<ContractOpener['getAddressInformation']>(),
                getConfig: jest.fn<ContractOpener['getConfig']>(),
                trackTransactionTree: jest.fn<ContractOpener['trackTransactionTree']>(),
                trackTransactionTreeWithResult: jest.fn<ContractOpener['trackTransactionTreeWithResult']>(),
                setLogger: jest.fn<ContractOpener['setLogger']>(),
            } satisfies ContractOpener;
            const tonIndexer = {
                endpoint: 'https://testnet.toncenter.com/api/v3/',
                getTransactionByHash: jest.fn(),
                getTransactionsByMessageHash: jest.fn(),
                getAdjacentTransactions: jest.fn(),
                findCollectibleCrossChainLayerTransaction: jest.fn(),
            } as jest.Mocked<IToncenterV3Indexer>;
            const config = createTrackerConfig({
                contractOpener,
                tonIndexer,
                crossChainLayerAddress,
            });
            const tracker = new OperationTracker(config, mockLogger, clientFactory);

            return { tracker, clients: clientFactory.getClients(), contractOpener, tonIndexer };
        };

        it('should get operation ID via explicit TON sequencer route', async () => {
            const transactionHash = '0xfaec7a40ea38b99b5701472f5d00e84ca6633c38b3ebee2826ff693834406352';
            const expectedId = 'op-ton-123';

            mockClients[0].getOperationIdByTonTransactionHash.mockResolvedValue(expectedId);

            const result = await operationTracker.getOperationIdByTonTransactionHash(transactionHash);

            expect(result).toBe(expectedId);
            expect(mockClients[0].getOperationIdByTonTransactionHash).toHaveBeenCalledWith(transactionHash);
            expect(mockLogger.debug).toHaveBeenCalledWith(
                `[OperationTracker: Getting operation ID by TON transaction hash "${transactionHash}"] Success (attempt 1/30)`,
            );
        });

        it('should return empty string when sequencer has no TON operation ID', async () => {
            const transactionHash = '0xfaec7a40ea38b99b5701472f5d00e84ca6633c38b3ebee2826ff693834406352';
            mockClients[0].getOperationIdByTonTransactionHash.mockResolvedValue('');

            const result = await operationTracker.getOperationIdByTonTransactionHash(transactionHash);

            expect(result).toBe('');
            expect(mockClients[0].getOperationIdByTonTransactionHash).toHaveBeenCalledWith(transactionHash);
        });

        it('should retry on second client when the first TON sequencer endpoint fails', async () => {
            const transactionHash = '0xfaec7a40ea38b99b5701472f5d00e84ca6633c38b3ebee2826ff693834406352';
            const expectedId = 'op-ton-456';
            mockClients[0].getOperationIdByTonTransactionHash.mockRejectedValue(new Error('Network error'));
            mockClients[1].getOperationIdByTonTransactionHash.mockResolvedValue(expectedId);

            const result = await operationTracker.getOperationIdByTonTransactionHash(transactionHash);

            expect(result).toBe(expectedId);
            expect(mockClients[0].getOperationIdByTonTransactionHash).toHaveBeenCalledTimes(1);
            expect(mockClients[1].getOperationIdByTonTransactionHash).toHaveBeenCalledTimes(1);
        });

        it('should resolve operation ID by any TON transaction hash through indexed CCL transaction', async () => {
            const { tracker, clients, tonIndexer } = createIndexedTracker();
            const inputHash = '0xa41ac40e63cb9aa683fe4702d2fc358afa896877cb21582cc841db7a6d0556b2';
            tonIndexer.findCollectibleCrossChainLayerTransaction.mockResolvedValue({
                account: crossChainLayerAddress,
                hash: cclTransactionHash,
                outMsgs: [],
            });
            clients[0].getOperationIdByTonTransactionHash.mockResolvedValue('op-1');

            const result = await tracker.getOperationIdByTonTransactionHash(inputHash, null);

            expect(result).toBe('op-1');
            expect(tonIndexer.findCollectibleCrossChainLayerTransaction).toHaveBeenCalledWith(
                inputHash,
                crossChainLayerAddress,
            );
            expect(clients[0].getOperationIdByTonTransactionHash).toHaveBeenCalledWith(sequencerCclTransactionHash);
        });

        it('should return empty string when indexed CCL transaction is not found', async () => {
            const { tracker, clients, tonIndexer } = createIndexedTracker();
            tonIndexer.findCollectibleCrossChainLayerTransaction.mockResolvedValue(null);

            const result = await tracker.getOperationIdByTonTransactionHash('tx-hash', null);

            expect(result).toBe('');
            expect(clients[0].getOperationIdByTonTransactionHash).not.toHaveBeenCalled();
        });

        it('should retry indexed CCL lookup for TON transaction hash', async () => {
            const { tracker, clients, tonIndexer } = createIndexedTracker();
            const inputHash = '0xa41ac40e63cb9aa683fe4702d2fc358afa896877cb21582cc841db7a6d0556b2';
            tonIndexer.findCollectibleCrossChainLayerTransaction.mockResolvedValueOnce(null).mockResolvedValue({
                account: crossChainLayerAddress,
                hash: cclTransactionHash,
                outMsgs: [],
            });
            clients[0].getOperationIdByTonTransactionHash.mockResolvedValue('op-2');

            const result = await tracker.getOperationIdByTonTransactionHash(inputHash, {
                timeout: 1000,
                maxAttempts: 2,
                delay: 1,
                successCheck: (id) => !!id,
            });

            expect(result).toBe('op-2');
            expect(tonIndexer.findCollectibleCrossChainLayerTransaction).toHaveBeenCalledTimes(2);
            expect(clients[0].getOperationIdByTonTransactionHash).toHaveBeenCalledWith(sequencerCclTransactionHash);
        });

        it('should throw when resolving operation ID by external TON message BOC without TON indexer', async () => {
            const ext = external({
                to: Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c'),
                body: beginCell().storeUint(1, 32).endCell(),
            });
            const boc = beginCell().store(storeMessage(ext)).endCell().toBoc().toString('base64');

            await expect(operationTracker.getOperationIdByTonTransactionBoc(boc, null)).rejects.toMatchObject({
                name: 'SettingError',
                errorCode: 143,
            });
        });

        it('should resolve operation ID by external TON message BOC', async () => {
            const { tracker, clients, contractOpener, tonIndexer } = createIndexedTracker();
            const rootTransactionHash = 'pBrEDmPLmqaD/kcC0vw1ivqJaHfLIVgsyEHbem0FVrI=';
            const ext = external({
                to: Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c'),
                body: beginCell().storeUint(1, 32).endCell(),
            });
            const boc = beginCell().store(storeMessage(ext)).endCell().toBoc().toString('base64');
            const expectedInMessageHash = Utils.getNormalizedExtMessageHash(ext);

            contractOpener.getTransactionByHash.mockResolvedValue({
                hash: () => Buffer.from(rootTransactionHash, 'base64'),
            } as never);
            tonIndexer.findCollectibleCrossChainLayerTransaction.mockResolvedValue({
                account: crossChainLayerAddress,
                hash: cclTransactionHash,
                outMsgs: [],
            });
            clients[0].getOperationIdByTonTransactionHash.mockResolvedValue('op-2');

            const result = await tracker.getOperationIdByTonTransactionBoc(boc, null);

            expect(result).toBe('op-2');
            const [actualAddress, actualInMessageHash] = contractOpener.getTransactionByHash.mock.calls[0];
            expect(actualAddress.equals(Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c'))).toBe(true);
            expect(actualInMessageHash).toBe(expectedInMessageHash);
            expect(tonIndexer.findCollectibleCrossChainLayerTransaction).toHaveBeenCalledWith(
                rootTransactionHash,
                crossChainLayerAddress,
            );
            expect(clients[0].getOperationIdByTonTransactionHash).toHaveBeenCalledWith(sequencerCclTransactionHash);
        });

        it('should retry full external TON message BOC flow until operation ID is resolved', async () => {
            const { tracker, clients, contractOpener, tonIndexer } = createIndexedTracker();
            const rootTransactionHash = 'pBrEDmPLmqaD/kcC0vw1ivqJaHfLIVgsyEHbem0FVrI=';
            const ext = external({
                to: Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c'),
                body: beginCell().storeUint(1, 32).endCell(),
            });
            const boc = beginCell().store(storeMessage(ext)).endCell().toBoc().toString('base64');
            const rootTransaction = {
                hash: () => Buffer.from(rootTransactionHash, 'base64'),
            } as never;

            contractOpener.getTransactionByHash.mockResolvedValueOnce(null).mockResolvedValue(rootTransaction);
            tonIndexer.findCollectibleCrossChainLayerTransaction.mockResolvedValueOnce(null).mockResolvedValue({
                account: crossChainLayerAddress,
                hash: cclTransactionHash,
                outMsgs: [],
            });
            clients[0].getOperationIdByTonTransactionHash.mockResolvedValueOnce('').mockResolvedValue('op-3');

            const result = await tracker.getOperationIdByTonTransactionBoc(boc, {
                timeout: 1000,
                maxAttempts: 4,
                delay: 1,
                successCheck: (id) => !!id,
            });

            expect(result).toBe('op-3');
            expect(contractOpener.getTransactionByHash).toHaveBeenCalledTimes(4);
            expect(tonIndexer.findCollectibleCrossChainLayerTransaction).toHaveBeenCalledTimes(3);
            expect(clients[0].getOperationIdByTonTransactionHash).toHaveBeenCalledTimes(2);
            expect(clients[0].getOperationIdByTonTransactionHash).toHaveBeenCalledWith(sequencerCclTransactionHash);
        });

        it('should throw SDK format error for invalid external TON message BOC', async () => {
            const { tracker } = createIndexedTracker();

            await expect(tracker.getOperationIdByTonTransactionBoc('not-a-boc', null)).rejects.toMatchObject({
                name: 'FormatError',
                errorCode: 141,
            });
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
            expect(mockLogger.debug).toHaveBeenCalledWith(
                `[OperationTracker: Simulating TAC message ${JSON.stringify(params, (k, v) => (typeof v === 'bigint' ? v.toString() : v))}] Success (attempt 1/30)`,
            );
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
            expect(mockLogger.warn).not.toHaveBeenCalled();
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
            const error = Object.assign(new Error('Simulation error'), { response: { status: 422 } });

            mockClients[0].simulateTACMessage.mockRejectedValue(error);
            mockClients[1].simulateTACMessage.mockRejectedValue(error);

            await expect(operationTracker.simulateTACMessage(params, immediateWaitOptions)).rejects.toThrow(FetchError);
            await expect(operationTracker.simulateTACMessage(params, immediateWaitOptions)).rejects.toMatchObject({
                errorCode: 117,
                httpStatus: 422,
                innerErrorName: 'Error',
                innerMessage: 'Simulation error',
            });
            expect(mockLogger.debug).toHaveBeenCalledWith(
                `[OperationTracker: Simulating TAC message ${JSON.stringify(params, (k, v) => (typeof v === 'bigint' ? v.toString() : v))}] Max attempts (1) reached`,
            );
        });

        it('should include http status and response message when all endpoints fail', async () => {
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
            const error = Object.assign(
                new Error(
                    'failed to fetch simulate tac msg: request POST http://localhost:8090/tac/simulator/simulate-message failed to complete request',
                ),
                {
                    name: 'AxiosError',
                    response: {
                        status: 422,
                        data: {
                            errorCode: 9001,
                            message: 'Bad TAC payload',
                        },
                    },
                },
            );

            mockClients[0].simulateTACMessage.mockRejectedValue(error);
            mockClients[1].simulateTACMessage.mockRejectedValue(error);

            await expect(operationTracker.simulateTACMessage(params, immediateWaitOptions)).rejects.toMatchObject({
                errorCode: 117,
                httpStatus: 422,
                innerMessage: 'Bad TAC payload',
            });
            await expect(operationTracker.simulateTACMessage(params, immediateWaitOptions)).rejects.toThrow(
                'httpStatus=422',
            );
            await expect(operationTracker.simulateTACMessage(params, immediateWaitOptions)).rejects.toThrow(
                'httpMessage=Bad TAC payload',
            );
            await expect(operationTracker.simulateTACMessage(params, immediateWaitOptions)).rejects.toThrow(
                'endpoint=http://localhost:8090/tac/simulator/simulate-message',
            );
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

        it('should include inner stack when waitOptions.includeErrorTrace is true', async () => {
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
            const error = Object.assign(new Error('Simulation error with stack'), { response: { status: 500 } });

            mockClients[0].simulateTACMessage.mockRejectedValue(error);
            mockClients[1].simulateTACMessage.mockRejectedValue(error);

            await expect(
                operationTracker.simulateTACMessage(params, {
                    includeErrorTrace: true,
                    maxAttempts: 1,
                }),
            ).rejects.toMatchObject({
                errorCode: 117,
                httpStatus: 500,
                innerMessage: 'Simulation error with stack',
            });

            await expect(
                operationTracker.simulateTACMessage(params, {
                    includeErrorTrace: true,
                    maxAttempts: 1,
                }),
            ).rejects.toHaveProperty('innerStack');
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
            expect(mockLogger.debug).toHaveBeenCalledWith(
                `[OperationTracker: Getting TVM executor fee ${JSON.stringify(params, (k, v) => (typeof v === 'bigint' ? v.toString() : v))}] Success (attempt 1/30)`,
            );
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
            expect(mockLogger.warn).not.toHaveBeenCalled();
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

            await expect(operationTracker.getTVMExecutorFee(params, immediateWaitOptions)).rejects.toThrow();
            expect(mockLogger.debug).toHaveBeenCalledWith(
                `[OperationTracker: Getting TVM executor fee ${JSON.stringify(params, (k, v) => (typeof v === 'bigint' ? v.toString() : v))}] Max attempts (1) reached`,
            );
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
