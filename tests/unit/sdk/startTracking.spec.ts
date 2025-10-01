import {
    BlockchainType,
    Network,
    OperationType,
    startTracking,
    startTrackingMultiple,
    TokenSymbol,
} from '../../../src';
import * as Utils from '../../../src/sdk/Utils';

const trackerMock = {
    getOperationId: jest.fn(),
    getOperationType: jest.fn(),
    getStageProfiling: jest.fn(),
};

const tonTxFinalizerMock = {
    trackTransactionTree: jest.fn(),
};

jest.mock('../../../src/sdk/OperationTracker', () => ({
    OperationTracker: jest.fn(() => trackerMock),
}));

jest.mock('../../../src/sdk/TxFinalizer', () => ({
    TonTxFinalizer: jest.fn(() => tonTxFinalizerMock),
}));

const sleepSpy = jest.spyOn(Utils, 'sleep').mockResolvedValue(undefined);

describe('startTracking helpers', () => {
    const logger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    };

    const profilingStage = {
        exists: true,
        stageData: {
            success: true,
            timestamp: 1,
            transactions: [
                {
                    hash: 'ton-tx-1',
                    blockchainType: BlockchainType.TON,
                },
            ],
            note: null,
        },
    };

    const profilingData = {
        operationType: OperationType.TAC_TON,
        metaInfo: {
            initialCaller: { address: 'EQCaller', blockchainType: BlockchainType.TON },
            validExecutors: { tac: [], ton: [] },
            feeInfo: {
                additionalFeeInfo: { attachedProtocolFee: '0', tokenFeeSymbol: TokenSymbol.TAC_SYMBOL },
                tac: { protocolFee: '0', executorFee: '0', tokenFeeSymbol: TokenSymbol.TAC_SYMBOL },
                ton: { protocolFee: '0', executorFee: '0', tokenFeeSymbol: TokenSymbol.TON_SYMBOL },
            },
            sentAssets: null,
            receivedAssets: null,
        },
        collectedInTAC: profilingStage,
        includedInTACConsensus: { exists: false, stageData: null },
        executedInTAC: profilingStage,
        collectedInTON: profilingStage,
        includedInTONConsensus: { exists: false, stageData: null },
        executedInTON: profilingStage,
    } as const;

    beforeEach(() => {
        jest.clearAllMocks();
        trackerMock.getOperationId.mockReset();
        trackerMock.getOperationType.mockReset();
        trackerMock.getStageProfiling.mockReset();
        tonTxFinalizerMock.trackTransactionTree.mockReset();

        trackerMock.getOperationId.mockResolvedValue('op-123');
        trackerMock.getOperationType
            .mockResolvedValueOnce(OperationType.PENDING)
            .mockResolvedValueOnce(OperationType.TAC_TON);
        trackerMock.getStageProfiling.mockResolvedValue(profilingData);
        tonTxFinalizerMock.trackTransactionTree.mockResolvedValue(undefined);
    });

    afterAll(() => {
        sleepSpy.mockRestore();
    });

    it('returns execution stages and verifies TON transactions when requested', async () => {
        const result = await startTracking(
            {
                caller: 'EQCaller',
                shardCount: 1,
                shardsKey: '42',
                timestamp: 1,
            },
            Network.TESTNET,
            {
                delay: 0,
                returnValue: true,
                tableView: false,
                txFinalizerConfig: {
                    urlBuilder: (hash) => `https://example.com/${hash}`,
                    authorization: { header: 'X-Key', value: 'token' },
                },
                logger,
            },
        );

        expect(result).toBe(profilingData);
        expect(trackerMock.getOperationId).toHaveBeenCalled();
        expect(trackerMock.getOperationType).toHaveBeenCalledTimes(2);
        expect(trackerMock.getStageProfiling).toHaveBeenCalledWith('op-123');
        expect(tonTxFinalizerMock.trackTransactionTree).toHaveBeenCalledWith('ton-tx-1');
    });

    it('throws when maximum iteration limit is exceeded', async () => {
        trackerMock.getOperationId.mockImplementation(() => Promise.reject(new Error('temporary')));

        await expect(
            startTracking(
                {
                    caller: 'EQCaller',
                    shardCount: 1,
                    shardsKey: '42',
                    timestamp: 1,
                },
                Network.TESTNET,
                {
                    delay: 0,
                    returnValue: true,
                    tableView: false,
                    maxIterationCount: 2,
                    logger,
                },
            ),
        ).rejects.toThrow('maximum number of iterations has been exceeded');

        expect(tonTxFinalizerMock.trackTransactionTree).not.toHaveBeenCalled();
    });

    it('aggregates multiple tracking requests when returnValue is true', async () => {
        trackerMock.getOperationType.mockResolvedValue(OperationType.TAC_TON);
        trackerMock.getStageProfiling.mockResolvedValue(profilingData);

        const results = await startTrackingMultiple(
            [
                { caller: 'EQCaller', shardCount: 1, shardsKey: '42', timestamp: 1 },
                { caller: 'EQCaller', shardCount: 1, shardsKey: '43', timestamp: 1 },
            ],
            Network.TESTNET,
            {
                delay: 0,
                returnValue: true,
                tableView: false,
                logger,
            },
        );

        expect(results).toHaveLength(2);
        expect(trackerMock.getStageProfiling).toHaveBeenCalledTimes(2);
    });
});
