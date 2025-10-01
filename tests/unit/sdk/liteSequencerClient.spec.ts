import { AssetType, CurrencyType, LiteSequencerClient, OperationType } from '../../../src';
import {
    convertCurrencyFetchError,
    convertCurrencyZeroValueError,
    emptyArrayError,
    getTONFeeInfoFetchError,
    operationFetchError,
    profilingFetchError,
    simulationFetchError,
    statusFetchError,
} from '../../../src/errors/instances';

describe('LiteSequencerClient', () => {
    let client: LiteSequencerClient;
    let mockHttpClient: any;

    const testEndpoint = 'https://test-sequencer.example.com';
    const testTransactionHash = '0x1234567890abcdef1234567890abcdef12345678';
    const testOperationId = 'op-12345';

    beforeEach(() => {
        mockHttpClient = {
            get: jest.fn(),
            post: jest.fn(),
            instance: {},
        };

        client = new LiteSequencerClient(testEndpoint, 50, mockHttpClient);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should create instance with default parameters', () => {
            const defaultClient = new LiteSequencerClient(testEndpoint);
            expect(defaultClient).toBeInstanceOf(LiteSequencerClient);
        });

        it('should create instance with custom parameters', () => {
            const customClient = new LiteSequencerClient(testEndpoint, 100, mockHttpClient);
            expect(customClient).toBeInstanceOf(LiteSequencerClient);
        });
    });

    describe('getOperationIdByTransactionHash', () => {
        it('should return operation ID for valid transaction hash', async () => {
            const mockResponse = {
                data: {
                    response: {
                        operationId: testOperationId,
                        logIndex: 1,
                    },
                },
            };
            mockHttpClient.get.mockResolvedValue(mockResponse);

            const result = await client.getOperationIdByTransactionHash(testTransactionHash);

            expect(result).toBe(testOperationId);
            expect(mockHttpClient.get).toHaveBeenCalledWith(
                `${testEndpoint}/getOperationIdByTxHash`,
                expect.objectContaining({
                    params: { txHash: testTransactionHash },
                }),
            );
        });

        it('should throw operationFetchError on HTTP error', async () => {
            const error = new Error('Network error');
            mockHttpClient.get.mockRejectedValue(error);

            await expect(client.getOperationIdByTransactionHash(testTransactionHash)).rejects.toEqual(
                operationFetchError(testTransactionHash, error),
            );
        });
    });

    describe('getOperationType', () => {
        it('should return operation type for valid operation ID', async () => {
            const mockResponse = {
                data: { response: OperationType.TAC_TON },
            };
            mockHttpClient.get.mockResolvedValue(mockResponse);

            const result = await client.getOperationType(testOperationId);

            expect(result).toBe(OperationType.TAC_TON);
            expect(mockHttpClient.get).toHaveBeenCalledWith(
                `${testEndpoint}/getOperationType`,
                expect.objectContaining({
                    params: { operationId: testOperationId },
                }),
            );
        });

        it('should throw operationFetchError on HTTP error', async () => {
            const error = new Error('Server error');
            mockHttpClient.get.mockRejectedValue(error);

            await expect(client.getOperationType(testOperationId)).rejects.toEqual(
                operationFetchError(testOperationId, error),
            );
        });
    });

    describe('getOperationId', () => {
        it('should return operation ID for valid transaction linker', async () => {
            const transactionLinker = {
                caller: 'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N',
                shardCount: 2,
                shardsKey: '12345',
                timestamp: 1700000000,
            };
            const mockResponse = {
                data: { response: testOperationId },
            };
            mockHttpClient.post.mockResolvedValue(mockResponse);

            const result = await client.getOperationId(transactionLinker);

            expect(result).toBe(testOperationId);
            expect(mockHttpClient.post).toHaveBeenCalledWith(
                `${testEndpoint}/getOperationId`,
                transactionLinker,
                expect.any(Object),
            );
        });

        it('should throw operationFetchError on HTTP error', async () => {
            const transactionLinker = {
                caller: 'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N',
                shardCount: 2,
                shardsKey: '12345',
                timestamp: 1700000000,
            };
            const error = new Error('Request failed');
            mockHttpClient.post.mockRejectedValue(error);

            await expect(client.getOperationId(transactionLinker)).rejects.toEqual(
                operationFetchError(JSON.stringify(transactionLinker), error),
            );
        });
    });

    describe('getOperationIdsByShardsKeys', () => {
        it('should return operation IDs for shards keys', async () => {
            const shardsKeys = ['key1', 'key2'];
            const caller = 'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N';
            const mockResponse = {
                data: { response: { key1: ['op1'], key2: ['op2'] } },
            };
            mockHttpClient.post.mockResolvedValue(mockResponse);

            const result = await client.getOperationIdsByShardsKeys(shardsKeys, caller);

            expect(result).toEqual({ key1: ['op1'], key2: ['op2'] });
            expect(mockHttpClient.post).toHaveBeenCalledWith(
                `${testEndpoint}/getOperationIdsByShardsKeys`,
                { shardsKeys, caller },
                expect.any(Object),
            );
        });

        it('should throw emptyArrayError for empty shards keys', async () => {
            await expect(client.getOperationIdsByShardsKeys([], 'caller')).rejects.toEqual(
                emptyArrayError('shardsKeys'),
            );
        });

        it('should throw operationFetchError on HTTP error', async () => {
            const error = new Error('Chunk error');
            mockHttpClient.post.mockRejectedValue(error);

            await expect(client.getOperationIdsByShardsKeys(['key1'], 'caller')).rejects.toEqual(
                operationFetchError('key1', error),
            );
        });
    });

    describe('getStageProfilings', () => {
        it('should return stage profiling data', async () => {
            const operationIds = ['op1', 'op2'];
            const mockResponse = {
                data: {
                    response: {
                        op1: { operationType: OperationType.TAC_TON },
                        op2: { operationType: OperationType.TON_TAC },
                    },
                },
            };
            mockHttpClient.post.mockResolvedValue(mockResponse);

            const result = await client.getStageProfilings(operationIds);

            expect(result).toEqual({
                op1: { operationType: OperationType.TAC_TON },
                op2: { operationType: OperationType.TON_TAC },
            });
            expect(mockHttpClient.post).toHaveBeenCalledWith(
                `${testEndpoint}/getStageProfilings`,
                { operationIds },
                expect.any(Object),
            );
        });

        it('should throw emptyArrayError for empty operation IDs', async () => {
            await expect(client.getStageProfilings([])).rejects.toEqual(emptyArrayError('operationIds'));
        });

        it('should throw profilingFetchError on HTTP error', async () => {
            const error = new Error('Profiling error');
            mockHttpClient.post.mockRejectedValue(error);

            await expect(client.getStageProfilings(['op1'])).rejects.toEqual(profilingFetchError('op1', error));
        });
    });

    describe('getOperationStatuses', () => {
        it('should return operation statuses', async () => {
            const operationIds = ['op1', 'op2'];
            const mockResponse = {
                data: {
                    response: {
                        op1: { status: 'completed' },
                        op2: { status: 'pending' },
                    },
                },
            };
            mockHttpClient.post.mockResolvedValue(mockResponse);

            const result = await client.getOperationStatuses(operationIds);

            expect(result).toEqual({
                op1: { status: 'completed' },
                op2: { status: 'pending' },
            });
            expect(mockHttpClient.post).toHaveBeenCalledWith(
                `${testEndpoint}/getOperationStatuses`,
                { operationIds },
                expect.any(Object),
            );
        });

        it('should throw emptyArrayError for empty operation IDs', async () => {
            await expect(client.getOperationStatuses([])).rejects.toEqual(emptyArrayError('operationIds'));
        });

        it('should throw statusFetchError on HTTP error', async () => {
            const error = new Error('Status error');
            mockHttpClient.post.mockRejectedValue(error);

            await expect(client.getOperationStatuses(['op1'])).rejects.toEqual(statusFetchError('op1', error));
        });
    });

    describe('convertCurrency', () => {
        const convertParams = {
            value: 100n,
            currency: CurrencyType.TON,
        };

        it('should convert currency successfully', async () => {
            const mockResponse = {
                data: {
                    response: {
                        spotValue: '95.5',
                        emaValue: '96.0',
                        decimals: 18,
                        currency: CurrencyType.TON,
                        tacPrice: { spot: '1.0', ema: '1.0', decimals: 18 },
                        tonPrice: { spot: '0.95', ema: '0.96', decimals: 9 },
                    },
                },
            };
            mockHttpClient.post.mockResolvedValue(mockResponse);

            const result = await client.convertCurrency(convertParams);

            expect(result.currency).toBe(CurrencyType.TON);
            expect(mockHttpClient.post).toHaveBeenCalledWith(
                `${testEndpoint}/convertCurrency`,
                convertParams,
                expect.any(Object),
            );
        });

        it('should throw convertCurrencyZeroValueError for zero value', async () => {
            const zeroParams = { ...convertParams, value: 0n };

            await expect(client.convertCurrency(zeroParams)).rejects.toEqual(convertCurrencyZeroValueError);
        });

        it('should throw convertCurrencyFetchError on HTTP error', async () => {
            const error = new Error('Conversion error');
            mockHttpClient.post.mockRejectedValue(error);

            await expect(client.convertCurrency(convertParams)).rejects.toEqual(
                convertCurrencyFetchError(JSON.stringify(convertParams), error),
            );
        });
    });

    describe('simulateTACMessage', () => {
        const simParams = {
            evmCall: {
                target: '0x1234567890123456789012345678901234567890',
                methodName: 'transfer',
                arguments: 'encoded-args',
                gasLimit: 21000,
            },
            shardsKey: 'shard-key',
            shardCount: 1,
            evmValidExecutors: ['0xexecutor1'],
            tvmValidExecutors: ['EQExecutor1'],
            tacCallParams: {
                target: '0x1234567890123456789012345678901234567890',
                methodName: 'transfer',
                arguments: 'encoded-args',
                gasLimit: 21000,
            },
            tonAssets: [],
            tonCaller: 'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N',
        };

        it('should simulate TAC message successfully', async () => {
            const mockResponse = {
                data: {
                    response: {
                        simulationStatus: true,
                        estimatedGas: 25000n,
                        suggestedTacExecutionFee: '1000000',
                        suggestedTonExecutionFee: '500000',
                        outMessages: [],
                    },
                },
            };
            mockHttpClient.post.mockResolvedValue(mockResponse);

            const result = await client.simulateTACMessage(simParams);

            expect(result.simulationStatus).toBe(true);
            expect(mockHttpClient.post).toHaveBeenCalledWith(
                `${testEndpoint}/simulateTACMessage`,
                simParams,
                expect.any(Object),
            );
        });

        it('should throw simulationFetchError on HTTP error', async () => {
            const error = new Error('Simulation error');
            mockHttpClient.post.mockRejectedValue(error);

            await expect(client.simulateTACMessage(simParams)).rejects.toEqual(
                simulationFetchError(JSON.stringify(simParams), error),
            );
        });
    });

    describe('getTVMExecutorFee', () => {
        const feeParams = {
            feeSymbol: 'TAC',
            tonAssets: [{ tokenAddress: '', amount: '1000', assetType: AssetType.FT }],
            tvmValidExecutors: ['EQExecutor1'],
        };

        it('should get TVM executor fee successfully', async () => {
            const mockResponse = {
                data: {
                    response: {
                        inTAC: '150000',
                        inTON: '300000',
                    },
                },
            };
            mockHttpClient.post.mockResolvedValue(mockResponse);

            const result = await client.getTVMExecutorFee(feeParams);

            expect(result.inTAC).toBe('150000');
            expect(result.inTON).toBe('300000');
            expect(mockHttpClient.post).toHaveBeenCalledWith(
                `${testEndpoint}/getTVMExecutorFee`,
                feeParams,
                expect.any(Object),
            );
        });

        it('should throw getTONFeeInfoFetchError on HTTP error', async () => {
            const error = new Error('Fee fetch error');
            mockHttpClient.post.mockRejectedValue(error);

            await expect(client.getTVMExecutorFee(feeParams)).rejects.toEqual(
                getTONFeeInfoFetchError(JSON.stringify(feeParams), error),
            );
        });
    });

    describe('error handling', () => {
        it('should handle network timeouts', async () => {
            const timeoutError = new Error('Request timeout');
            mockHttpClient.get.mockRejectedValue(timeoutError);

            await expect(client.getOperationType('test-id')).rejects.toEqual(
                operationFetchError('test-id', timeoutError),
            );
        });

        it('should handle malformed responses', async () => {
            const malformedResponse = { data: { notTheExpectedFormat: true } };
            mockHttpClient.get.mockResolvedValue(malformedResponse);

            const result = await client.getOperationType('test-id');
            expect(result).toBeUndefined();
        });
    });

    describe('chunked processing', () => {
        it('should handle large arrays by chunking requests', async () => {
            const largeShardsKeys = Array.from({ length: 100 }, (_, i) => `key${i}`);
            const caller = 'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N';
            const mockResponse = { data: { response: {} } };
            mockHttpClient.post.mockResolvedValue(mockResponse);

            await client.getOperationIdsByShardsKeys(largeShardsKeys, caller, 25);

            // Should be called multiple times for chunked processing
            expect(mockHttpClient.post).toHaveBeenCalledTimes(4); // 100/25 = 4 chunks
        });

        it('should handle chunked profiling requests', async () => {
            const largeOperationIds = Array.from({ length: 100 }, (_, i) => `op${i}`);
            const mockResponse = { data: { response: {} } };
            mockHttpClient.post.mockResolvedValue(mockResponse);

            await client.getStageProfilings(largeOperationIds, 30);

            expect(mockHttpClient.post).toHaveBeenCalledTimes(4); // 100/30 = 3.33, rounded up to 4
        });

        it('should handle chunked status requests', async () => {
            const largeOperationIds = Array.from({ length: 150 }, (_, i) => `op${i}`);
            const mockResponse = { data: { response: {} } };
            mockHttpClient.post.mockResolvedValue(mockResponse);

            await client.getOperationStatuses(largeOperationIds, 40);

            expect(mockHttpClient.post).toHaveBeenCalledTimes(4); // 150/40 = 3.75, rounded up to 4
        });
    });
});
