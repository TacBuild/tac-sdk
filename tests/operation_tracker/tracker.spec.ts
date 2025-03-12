import {
    Network,
    OperationTracker,
    OperationType,
    ProfilingStageData,
    SimplifiedStatuses,
    TransactionLinker,
} from '../../src';

describe('Operation Tracker', () => {
    let tracker: OperationTracker;

    let operationIds: string[];
    let shardsKeys: string[];
    let caller: string;
    let transactionLinker: TransactionLinker;

    function validateProfilingStageData(stage: ProfilingStageData) {
        expect(typeof stage).toBe('object');

        expect(typeof stage.exists).toBe('boolean');

        if (stage.exists && stage.stageData) {
            expect(typeof stage.stageData.success).toBe('boolean');
            expect(typeof stage.stageData.timestamp).toBe('number');
            expect(typeof stage.stageData.note).toBe('object');

            if (stage.stageData.transactions != null) {
                expect(Array.isArray(stage.stageData.transactions)).toBe(true);
            }
        }
    }

    beforeAll(async () => {
        tracker = new OperationTracker(Network.TESTNET, ['http://localhost:8080']);

        operationIds = [
            '0x5205e851dd805e6cd13eda408abe4a26831a092f260df442a31828e7db581abf',
            '0xb57a72384293ebd7966bbd183d6e3ff8daa5bee0843e45f661ee082910a35de8',
        ];

        shardsKeys = ['6232672141576619690', '1739908831'];
        caller = 'EQDoF2OkxsI3gc5jAuxlqozN9H_SgEOUCopMa1yU4djLaXuL';

        transactionLinker = {
            shardsKey: shardsKeys[0],
            caller: caller,
            shardCount: 2,
            timestamp: 1739908682,
        };
    });

    it('getOperationId', async () => {
        const result = await tracker.getOperationId(transactionLinker);
        expect(result).not.toBeNull();
        expect(result).not.toEqual('');
        console.log(result);
    });

    it('getOperationIdsByShardsKeys', async () => {
        const result = await tracker.getOperationIdsByShardsKeys(shardsKeys, caller);
        expect(result).not.toBeNull();
        expect(result).not.toEqual('');
        expect(Object.keys(result)).toHaveLength(shardsKeys.length);

        for (const key of shardsKeys) {
            expect(result[key]).not.toBeNull();
            expect(result[key].operationIds.length).toBeGreaterThan(0);
        }

        console.log(result);
    });

    it('getOperationType', async () => {
        const result = await tracker.getOperationType(operationIds[0]);

        expect(typeof result).toBe('string');
        expect(Object.values(OperationType)).toContain(result);

        console.log(result);
    });

    it('getOperationStatus', async () => {
        const result = await tracker.getOperationStatus(operationIds[0]);

        expect(typeof result).toBe('object');
        expect(typeof result.success).toBe('boolean');
        expect(typeof result.timestamp).toBe('number');
        expect(typeof result.stage).toBe('string');
        expect(Array.isArray(result.transactions)).toBe(true);
        expect(typeof result.note).toBe('object');

        console.log(result);
    });

    it('getSimplifiedOperationStatus', async () => {
        const result = await tracker.getSimplifiedOperationStatus(transactionLinker);
        console.log(SimplifiedStatuses[result]);
    });

    it('getOperationStatuses', async () => {
        const result = await tracker.getOperationStatuses(operationIds);

        expect(Object.keys(result)).toHaveLength(operationIds.length);

        for (const operationId of operationIds) {
            expect(result).toHaveProperty(operationId);
            expect(typeof result[operationId]).toBe('object');
            expect(typeof result[operationId].success).toBe('boolean');
            expect(typeof result[operationId].timestamp).toBe('number');
            expect(typeof result[operationId].stage).toBe('string');
            expect(Array.isArray(result[operationId].transactions)).toBe(true);
            expect(typeof result[operationId].note).toBe('object');
        }

        console.log(result);
    });

    it('getStageProfiling', async () => {
        const result = await tracker.getStageProfiling(operationIds[0]);

        expect(typeof result).toBe('object');
        expect(typeof result.operationType).toBe('string');
        expect(Object.values(OperationType)).toContain(result.operationType);

        const executionStages = [
            result.collectedInTAC,
            result.includedInTACConsensus,
            result.executedInTAC,
            result.collectedInTON,
            result.includedInTONConsensus,
            result.executedInTON,
        ];

        executionStages.forEach((stage) => {
            validateProfilingStageData(stage);
        });

        console.log(result);
    });

    it('getStageProfilings', async () => {
        const result = await tracker.getStageProfilings(operationIds);

        expect(Object.keys(result)).toHaveLength(operationIds.length);
        expect(typeof result.operationType).toBe('string');
        expect(Object.values(OperationType)).toContain(result.operationType);

        for (const operationId of operationIds) {
            expect(typeof result[operationId]).toBe('object');

            const executionStages = [
                result[operationId].collectedInTAC,
                result[operationId].includedInTACConsensus,
                result[operationId].executedInTAC,
                result[operationId].collectedInTON,
                result[operationId].includedInTONConsensus,
                result[operationId].executedInTON,
            ];

            executionStages.forEach((stage) => {
                validateProfilingStageData(stage);
            });
        }

        console.log(result);
    });
});
