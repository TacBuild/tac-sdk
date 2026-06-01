import {
    AssetType,
    ExecutionStages,
    insufficientFeeParamsError,
    missingFeeParamsError,
    missingGasLimitError,
    missingTvmExecutorFeeError,
    OperationType,
    TON,
    TONTransactionManager,
} from '../../../src';

describe('TONTransactionManager.buildFeeParams', () => {
    const simulator = {
        getSimulationInfo: jest.fn(),
    };

    const operationTracker = {};

    const config = {
        getTrustedTACExecutors: ['0xExecutor'],
        getTrustedTONExecutors: ['EQC2g0rkJP6wXNjZspGDZCBoBPXaGNsq4CPGK8PvX9nuXNFI'],
    };

    const logger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    };

    const manager = new TONTransactionManager(
        config as never,
        simulator as never,
        operationTracker as never,
        logger as never,
    );

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('throws when required fee params are missing in withoutSimulation mode', async () => {
        await expect(
            manager.buildFeeParams(
                { withoutSimulation: true },
                { evmTargetAddress: '0xTarget' },
                {} as never,
                { evmProxyMsg: { evmTargetAddress: '0xTarget' } } as never,
            ),
        ).rejects.toEqual(missingFeeParamsError);
    });

    it('throws when tvmExecutorFee not provided for round trip', async () => {
        await expect(
            manager.buildFeeParams(
                { withoutSimulation: true, protocolFee: 1n, evmExecutorFee: 2n, isRoundTrip: true },
                { evmTargetAddress: '0xTarget' },
                {} as never,
                { evmProxyMsg: { evmTargetAddress: '0xTarget' } } as never,
            ),
        ).rejects.toEqual(missingTvmExecutorFeeError);
    });

    it('throws when gas limit is missing for manual mode', async () => {
        await expect(
            manager.buildFeeParams(
                { withoutSimulation: true, protocolFee: 1n, evmExecutorFee: 2n, tvmExecutorFee: 3n },
                { evmTargetAddress: '0xTarget' },
                {} as never,
                { evmProxyMsg: { evmTargetAddress: '0xTarget' } } as never,
            ),
        ).rejects.toEqual(missingGasLimitError);
    });

    it('returns provided values when withoutSimulation data is complete', async () => {
        const result = await manager.buildFeeParams(
            {
                withoutSimulation: true,
                protocolFee: 1n,
                evmExecutorFee: 2n,
                tvmExecutorFee: 3n,
                isRoundTrip: true,
            },
            { evmTargetAddress: '0xTarget', gasLimit: 5n },
            {} as never,
            { evmProxyMsg: { evmTargetAddress: '0xTarget' } } as never,
        );

        expect(result).toEqual({
            protocolFee: 1n,
            evmExecutorFee: 2n,
            tvmExecutorFee: 3n,
            gasLimit: 5n,
            isRoundTrip: true,
        });
    });

    it('delegates to simulator when withoutSimulation is false', async () => {
        simulator.getSimulationInfo.mockResolvedValue({
            feeParams: {
                protocolFee: 10n,
                evmExecutorFee: 20n,
                tvmExecutorFee: 30n,
                gasLimit: 40n,
                isRoundTrip: true,
            },
        });

        const evmProxyMsg = { evmTargetAddress: '0xTarget' } as { evmTargetAddress: string; gasLimit?: bigint };
        const result = await manager.buildFeeParams(
            {},
            evmProxyMsg,
            {} as never,
            {
                evmProxyMsg: { evmTargetAddress: '0xTarget' },
                assets: [{ type: AssetType.FT }],
            } as never,
        );

        expect(simulator.getSimulationInfo).toHaveBeenCalled();
        expect(evmProxyMsg.gasLimit).toBe(40n);
        expect(result).toEqual({
            protocolFee: 10n,
            evmExecutorFee: 20n,
            tvmExecutorFee: 30n,
            gasLimit: 40n,
            isRoundTrip: true,
            evmEstimatedGas: undefined,
        });
    });

    it('throws when explicit fee params are lower than suggested', async () => {
        simulator.getSimulationInfo.mockResolvedValue({
            feeParams: {
                protocolFee: 10n,
                evmExecutorFee: 20n,
                tvmExecutorFee: 30n,
                gasLimit: 40n,
                isRoundTrip: true,
            },
            simulation: {
                simulationStatus: true,
                estimatedGas: 123n,
            },
        });

        const evmProxyMsg = { evmTargetAddress: '0xTarget' } as { evmTargetAddress: string; gasLimit?: bigint };
        await expect(
            manager.buildFeeParams(
                { evmExecutorFee: 5n },
                evmProxyMsg,
                {} as never,
                {
                    evmProxyMsg: { evmTargetAddress: '0xTarget' },
                    assets: [{ type: AssetType.FT }],
                } as never,
            ),
        ).rejects.toThrow(insufficientFeeParamsError('evmExecutorFee', 5n, 20n).message);
    });

    it('allows explicit lower fees when shouldValidateFees is false', async () => {
        simulator.getSimulationInfo.mockResolvedValue({
            feeParams: {
                protocolFee: 10n,
                evmExecutorFee: 20n,
                tvmExecutorFee: 30n,
                gasLimit: 40n,
                isRoundTrip: true,
            },
            simulation: {
                simulationStatus: true,
                estimatedGas: 123n,
            },
        });

        const evmProxyMsg = { evmTargetAddress: '0xTarget' } as { evmTargetAddress: string; gasLimit?: bigint };
        const result = await manager.buildFeeParams(
            { evmExecutorFee: 5n, shouldValidateFees: false },
            evmProxyMsg,
            {} as never,
            {
                evmProxyMsg: { evmTargetAddress: '0xTarget' },
                assets: [{ type: AssetType.FT }],
            } as never,
        );

        expect(result).toEqual({
            protocolFee: 10n,
            evmExecutorFee: 5n,
            tvmExecutorFee: 30n,
            gasLimit: 40n,
            isRoundTrip: true,
            evmEstimatedGas: 123n,
        });
    });
});

describe('TONTransactionManager.sendCrossChainTransaction', () => {
    let stageProfilingResult: ExecutionStages;

    const simulator = {
        estimateTONFee: jest.fn(),
    };

    const operationTracker = {
        getOperationId: jest.fn(),
        getOperationIdByTonTransactionBoc: jest.fn(),
        getOperationType: jest.fn(),
        getStageProfiling: jest.fn(),
    };

    const contractOpener = {
        trackTransactionTree: jest.fn(),
    };

    const config = {
        network: 'testnet',
        TONParams: {
            contractOpener,
            crossChainLayerAddress: 'EQCrossChainLayer',
        },
    };

    const logger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    };

    const externalMessageBoc = 'external-message-boc';

    const sender = {
        getSenderAddress: jest.fn().mockReturnValue('EQSender'),
        sendShardTransaction: jest.fn().mockResolvedValue({
            success: true,
            boc: externalMessageBoc,
        }),
    };

    const manager = new TONTransactionManager(
        config as never,
        simulator as never,
        operationTracker as never,
        logger as never,
    );

    const prepareCrossChainTransactionSpy = jest.spyOn(manager as never, 'prepareCrossChainTransaction' as never);
    const checkBalanceSpy = jest.spyOn(TON, 'checkBalance').mockResolvedValue(undefined);

    beforeEach(() => {
        jest.clearAllMocks();
        stageProfilingResult = {
            operationType: OperationType.TON_TAC,
            metaInfo: {},
            executedInTON: {
                exists: false,
                stageData: null,
            },
        } as never;
        operationTracker.getStageProfiling.mockImplementation(
            async (
                _operationId: string,
                waitOptions?: { onSuccess?: (profilingData: ExecutionStages) => Promise<void> | void },
            ) => {
                await waitOptions?.onSuccess?.(stageProfilingResult);
                return stageProfilingResult;
            },
        );
        operationTracker.getOperationIdByTonTransactionBoc.mockResolvedValue('op-1');
        operationTracker.getOperationId.mockResolvedValue('op-linker');
    });

    afterAll(() => {
        prepareCrossChainTransactionSpy.mockRestore();
        checkBalanceSpy.mockRestore();
    });

    it('waits for generic finalization and validates TON transaction tree from profiling', async () => {
        const transactionLinker = {
            caller: 'EQSender',
            shardCount: 1,
            shardsKey: '123',
            timestamp: 456,
        };

        prepareCrossChainTransactionSpy.mockResolvedValue({
            transaction: {
                validUntil: 1,
                messages: [],
                network: 'testnet',
            },
            transactionLinker,
        } as never);
        operationTracker.getOperationType.mockResolvedValue(OperationType.TON_TAC_TON);
        stageProfilingResult = {
            operationType: OperationType.TON_TAC_TON,
            metaInfo: {},
            executedInTON: {
                exists: true,
                stageData: {
                    success: true,
                    timestamp: 1,
                    transactions: [{ hash: 'tx-1', blockchainType: 'TON' }],
                    note: null,
                },
            },
        } as never;

        const result = await manager.sendCrossChainTransaction(
            { evmTargetAddress: '0xTarget' } as never,
            sender as never,
            {
                options: {
                    ensureTxExecuted: false,
                    finalizationWaitOptions: {
                        maxAttempts: 2,
                        delay: 10,
                        context: {
                            trackTransactionTreeOptions: { maxDepth: 5 },
                        },
                    },
                },
            } as never,
        );

        expect(result.operationId).toBe('op-1');
        expect(checkBalanceSpy).toHaveBeenCalled();
        expect(operationTracker.getOperationIdByTonTransactionBoc).toHaveBeenCalledWith(
            externalMessageBoc,
            expect.objectContaining({ logger }),
        );
        expect(operationTracker.getOperationId).not.toHaveBeenCalled();
        expect(operationTracker.getOperationType).not.toHaveBeenCalled();
        expect(operationTracker.getStageProfiling).toHaveBeenCalledWith(
            'op-1',
            expect.objectContaining({
                logger,
                maxAttempts: 2,
                delay: 10,
                successCheck: expect.any(Function),
                context: {
                    trackTransactionTreeOptions: { maxDepth: 5 },
                },
            }),
        );
        expect(contractOpener.trackTransactionTree).toHaveBeenCalledWith('EQCrossChainLayer', 'tx-1');
    });

    it('completes generic finalization even when executedInTON stage is absent', async () => {
        prepareCrossChainTransactionSpy.mockResolvedValue({
            transaction: {
                validUntil: 1,
                messages: [],
                network: 'testnet',
            },
            transactionLinker: {
                caller: 'EQSender',
                shardCount: 1,
                shardsKey: '123',
                timestamp: 456,
            },
        } as never);
        await manager.sendCrossChainTransaction(
            { evmTargetAddress: '0xTarget' } as never,
            sender as never,
            {
                options: {
                    ensureTxExecuted: false,
                    finalizationWaitOptions: {},
                },
            } as never,
        );

        expect(operationTracker.getOperationType).not.toHaveBeenCalled();
        expect(operationTracker.getOperationIdByTonTransactionBoc).toHaveBeenCalledWith(
            externalMessageBoc,
            expect.objectContaining({ logger }),
        );
        expect(operationTracker.getStageProfiling).toHaveBeenCalledWith(
            'op-1',
            expect.objectContaining({
                logger,
                successCheck: expect.any(Function),
            }),
        );
        expect(contractOpener.trackTransactionTree).not.toHaveBeenCalled();
    });

    it('skips full finalization when waitFinalization is false', async () => {
        prepareCrossChainTransactionSpy.mockResolvedValue({
            transaction: {
                validUntil: 1,
                messages: [],
                network: 'testnet',
            },
            transactionLinker: {
                caller: 'EQSender',
                shardCount: 1,
                shardsKey: '123',
                timestamp: 456,
            },
        } as never);
        const result = await manager.sendCrossChainTransaction(
            { evmTargetAddress: '0xTarget' } as never,
            sender as never,
            {
                options: {
                    ensureTxExecuted: false,
                    waitFinalization: false,
                },
            } as never,
        );

        expect(result.operationId).toBe('op-1');
        expect(operationTracker.getOperationIdByTonTransactionBoc).toHaveBeenCalledWith(
            externalMessageBoc,
            expect.objectContaining({ logger }),
        );
        expect(operationTracker.getOperationType).not.toHaveBeenCalled();
        expect(operationTracker.getStageProfiling).not.toHaveBeenCalled();
        expect(contractOpener.trackTransactionTree).not.toHaveBeenCalled();
    });

    it('falls back to transaction linker when BOC lookup does not resolve operation id', async () => {
        const transactionLinker = {
            caller: 'EQSender',
            shardCount: 1,
            shardsKey: '123',
            timestamp: 456,
        };
        prepareCrossChainTransactionSpy.mockResolvedValue({
            transaction: {
                validUntil: 1,
                messages: [],
                network: 'testnet',
            },
            transactionLinker,
        } as never);
        operationTracker.getOperationIdByTonTransactionBoc.mockResolvedValue('');

        const result = await manager.sendCrossChainTransaction(
            { evmTargetAddress: '0xTarget' } as never,
            sender as never,
            {
                options: {
                    ensureTxExecuted: false,
                    waitFinalization: false,
                },
            } as never,
        );

        expect(result.operationId).toBe('op-linker');
        expect(operationTracker.getOperationIdByTonTransactionBoc).toHaveBeenCalledWith(
            externalMessageBoc,
            expect.objectContaining({ logger }),
        );
        expect(operationTracker.getOperationId).toHaveBeenCalledWith(
            transactionLinker,
            expect.objectContaining({ logger }),
        );
        expect(operationTracker.getStageProfiling).not.toHaveBeenCalled();
    });
});
