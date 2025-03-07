import {
    ExecutionStages,
    ExecutionStagesTableData,
    Network,
    OperationType,
    TrackingOperationResult,
    TransactionLinker,
} from '../structs/Struct';
import { MAX_ITERATION_COUNT } from './Consts';
import { OperationTracker } from './OperationTracker';
import { sleep } from './Utils';

export async function startTracking(
    transactionLinker: TransactionLinker,
    network: Network,
    customLiteSequencerEndpoints?: string[],
    delay: number = 10,
    maxIterationCount = MAX_ITERATION_COUNT,
    returnValue: boolean = false,
): Promise<void | TrackingOperationResult> {
    const tracker = new OperationTracker(network, customLiteSequencerEndpoints);

    console.log('Start tracking operation');
    console.log('caller: ', transactionLinker.caller);
    console.log('shardsKey: ', transactionLinker.shardsKey);
    console.log('shardCount: ', transactionLinker.shardCount);
    console.log('timestamp: ', transactionLinker.timestamp);

    let operationId = '';
    let iteration = 0; // number of iterations
    let operationType = '';
    let ok = true; // finished successfully
    let errorMessage: string | null;

    while (true) {
        ++iteration;
        if (iteration >= maxIterationCount) {
            ok = false;
            errorMessage = 'maximum number of iterations has been exceeded';
            break;
        }

        console.log();

        if (operationId == '') {
            console.log('request operationId');

            try {
                operationId = await tracker.getOperationId(transactionLinker);
            } catch (err) {
                console.log('get operationId error');
            }
        } else {
            console.log('request operationType');

            try {
                operationType = await tracker.getOperationType(operationId);
                if (operationType != OperationType.PENDING && operationType != OperationType.UNKNOWN) {
                    break;
                }
            } catch (err) {
                console.log('failed to get operation type:', err);
            }

            console.log('operationId:', operationId);
            console.log('operationType:', operationType);
            console.log('time: ', Math.floor(+new Date() / 1000));
        }
        await sleep(delay * 1000);
    }

    console.log('Tracking finished');
    if (!ok) {
        console.log(errorMessage!);
    }

    const profilingData = await tracker.getStageProfiling(operationId);
    const tableData = formatExecutionStages(profilingData);

    if (returnValue) {
        return { profilingData, tableData };
    }

    console.log(profilingData.operationType);
    console.table(tableData);
}

function formatExecutionStages(stages: ExecutionStages): ExecutionStagesTableData[] {
    const { operationType, ...stagesData } = stages;

    return Object.entries(stagesData).map(([stage, data]) => ({
        Stage: stage,
        Exists: data.exists ? 'Yes' : 'No',
        Success: data.exists && data.stageData ? (data.stageData.success ? 'Yes' : 'No') : '-',
        Timestamp: data.exists && data.stageData ? new Date(data.stageData.timestamp * 1000).toLocaleString() : '-',
        Transactions:
            data.exists &&
            data.stageData &&
            data.stageData.transactions != null &&
            data.stageData.transactions.length > 0
                ? data.stageData.transactions.map((t) => t.hash).join(', ')
                : '-',
        NoteContent: data.exists && data.stageData && data.stageData.note != null ? data.stageData.note.content : '-',
        ErrorName: data.exists && data.stageData && data.stageData.note != null ? data.stageData.note.errorName : '-',
        InternalMsg:
            data.exists && data.stageData && data.stageData.note != null ? data.stageData.note.internalMsg : '-',
        BytesError:
            data.exists && data.stageData && data.stageData.note != null ? data.stageData.note.internalBytesError : '-',
    }));
}
