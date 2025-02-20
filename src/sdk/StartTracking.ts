import { ExecutionStages, Network, TransactionLinker } from '../structs/Struct';
import { MAX_ITERATION_COUNT } from './Consts';
import { OperationTracker } from './OperationTracker';
import { sleep } from './Utils';

export async function startTracking(
    transactionLinker: TransactionLinker,
    network: Network,
    isBridgeOperation: boolean = false,
    customLiteSequencerEndpoints?: string[],
): Promise<void> {
    const tracker = new OperationTracker(network, customLiteSequencerEndpoints);

    console.log('Start tracking operation');
    console.log('caller: ', transactionLinker.caller);
    console.log('shardsKey: ', transactionLinker.shardsKey);
    console.log('shardCount: ', transactionLinker.shardCount);
    console.log('timestamp: ', transactionLinker.timestamp);

    let operationId = '';
    let currentStatus = '';
    let iteration = 0; // number of iterations
    let ok = true; // finished successfully
    let errorMessage: string | null;

    while (true) {
        ++iteration;
        if (iteration >= MAX_ITERATION_COUNT) {
            ok = false;
            errorMessage = 'maximum number of iterations has been exceeded';
            break;
        }

        console.log();
        const finalStatus = isBridgeOperation ? tracker.BRIDGE_TERMINATED_STATUS : tracker.TERMINATED_STATUS;
        if (currentStatus == finalStatus) {
            break;
        }

        if (operationId == '') {
            console.log('request operationId');

            try {
                operationId = await tracker.getOperationId(transactionLinker);
            } catch {
                console.log('get operationId error');
            }
        } else {
            console.log('request operationStatus');

            try {
                const status = await tracker.getOperationStatuses([operationId]);
                currentStatus = status[operationId].stage;

                if (!status[operationId].success) {
                    if (status[operationId].transactions != null && status[operationId].transactions!.length > 0) {
                        console.log('transactionHash: ', status[operationId].transactions![0]);
                    }
                    console.log(status[operationId]);
                    ok = false;
                    errorMessage = status[operationId].note != null ? status[operationId].note!.errorName : '';
                    break;
                }
            } catch (err) {
                console.log('get status error:', err);
            }

            console.log('operationId:', operationId);
            console.log('status: ', currentStatus);
            console.log('time: ', Math.floor(+new Date() / 1000));
        }
        await sleep(10 * 1000);
    }

    if (!ok) {
        console.log(`Finished with error: ${errorMessage!}`);
    } else {
        console.log('Tracking successfully finished');
    }
    const stages = await tracker.getStageProfiling(operationId);
    formatExecutionStages(stages);
}

const formatExecutionStages = (stages: ExecutionStages) => {
    const tableData = Object.entries(stages).map(([stage, data]) => ({
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
        'Note Content':
            data.exists && data.stageData && data.stageData.note != null ? data.stageData.note.content : '-',
        'Error Name':
            data.exists && data.stageData && data.stageData.note != null ? data.stageData.note.errorName : '-',
        'Internal Msg':
            data.exists && data.stageData && data.stageData.note != null ? data.stageData.note.internalMsg : '-',
        'Bytes Error':
            data.exists && data.stageData && data.stageData.note != null ? data.stageData.note.internalBytesError : '-',
    }));

    console.table(tableData);
};
