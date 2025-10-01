import {
    AssetType,
    missingFeeParamsError,
    missingGasLimitError,
    missingTvmExecutorFeeError,
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
            (manager as any).buildFeeParams(
                { withoutSimulation: true },
                { evmTargetAddress: '0xTarget' },
                {} as never,
                { evmProxyMsg: { evmTargetAddress: '0xTarget' } } as never,
            ),
        ).rejects.toEqual(missingFeeParamsError);
    });

    it('throws when tvmExecutorFee not provided for round trip', async () => {
        await expect(
            (manager as any).buildFeeParams(
                { withoutSimulation: true, protocolFee: 1n, evmExecutorFee: 2n, isRoundTrip: true },
                { evmTargetAddress: '0xTarget' },
                {} as never,
                { evmProxyMsg: { evmTargetAddress: '0xTarget' } } as never,
            ),
        ).rejects.toEqual(missingTvmExecutorFeeError);
    });

    it('throws when gas limit is missing for manual mode', async () => {
        await expect(
            (manager as any).buildFeeParams(
                { withoutSimulation: true, protocolFee: 1n, evmExecutorFee: 2n, tvmExecutorFee: 3n },
                { evmTargetAddress: '0xTarget' },
                {} as never,
                { evmProxyMsg: { evmTargetAddress: '0xTarget' } } as never,
            ),
        ).rejects.toEqual(missingGasLimitError);
    });

    it('returns provided values when withoutSimulation data is complete', async () => {
        const result = await (manager as any).buildFeeParams(
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
        const result = await (manager as any).buildFeeParams(
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
        });
    });
});
