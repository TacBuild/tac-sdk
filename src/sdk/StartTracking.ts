import { ExecutionStages, Network, OperationType, TransactionLinker } from '../structs/Struct';
import { MAX_ITERATION_COUNT } from './Consts';
import { OperationTracker } from './OperationTracker';
import { sleep } from './Utils';
import Table from 'cli-table3';

export async function startTracking(
    transactionLinker: TransactionLinker,
    network: Network,
    options?: {
        customLiteSequencerEndpoints?: string[];
        delay?: number;
        maxIterationCount?: number;
        returnValue?: boolean;
        tableView?: boolean;
    },
): Promise<void | ExecutionStages> {
    const {
        customLiteSequencerEndpoints,
        delay = 10,
        maxIterationCount = MAX_ITERATION_COUNT,
        returnValue = false,
        tableView = true,
    } = options || {};

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
    let errorMessage: string = '';

    while (true) {
        ++iteration;
        if (iteration >= maxIterationCount) {
            ok = false;
            errorMessage = 'maximum number of iterations has been exceeded';
            break;
        }

        if (operationId == '') {
            console.log('request operationId');

            try {
                operationId = await tracker.getOperationId(transactionLinker);
            } catch (err) {}
        } else {

            try {
                operationType = await tracker.getOperationType(operationId);
                if (operationType != OperationType.PENDING && operationType != OperationType.UNKNOWN) {
                    break;
                }
            } catch (err) {
                console.log('failed to get operation type:', err);
            }

            console.log(`
                operationId: ${operationId}
                operationType: ${operationType}
                time: ${new Date().toISOString()} (${Math.floor(+new Date() / 1000)})
            `);
        }
        await sleep(delay * 1000);
    }

    console.log('Tracking finished');
    if (!ok) {
        if (returnValue) {
            throw Error(errorMessage);
        }
        console.log(errorMessage);
    }

    const profilingData = await tracker.getStageProfiling(operationId);

    if (returnValue) {
        return profilingData;
    }

    console.log(profilingData.operationType);
    console.log(profilingData.metaInfo);
    if (tableView) {
        printExecutionStagesTable(profilingData);
    } else {
        console.log(formatExecutionStages(profilingData));
    }
}

export async function startTrackingMultiple(
    transactionLinkers: TransactionLinker[],
    network: Network,
    options?: {
        customLiteSequencerEndpoints?: string[];
        delay?: number;
        maxIterationCount?: number;
        returnValue?: boolean;
        tableView?: boolean;
    },
): Promise<void | ExecutionStages[]> {
    const {
        customLiteSequencerEndpoints,
        delay = 10,
        maxIterationCount = MAX_ITERATION_COUNT,
        returnValue = false,
        tableView = true,
    } = options || {};

    console.log(`Start tracking ${transactionLinkers.length} operations`);

    const results = await Promise.all(
        transactionLinkers.map((linker, index) => {
            console.log(`\nProcessing operation ${index + 1}/${transactionLinkers.length}`);
            return startTracking(linker, network, {
                customLiteSequencerEndpoints,
                delay,
                maxIterationCount,
                returnValue: true,
                tableView: false,
            });
        })
    );

    if (returnValue) {
        return results as ExecutionStages[];
    }

    if (tableView) {
        results.forEach((result, index) => {
            console.log(`\nResults for operation ${index + 1}:`);
            printExecutionStagesTable(result as ExecutionStages);
        });
    } else {
        results.forEach((result, index) => {
            console.log(`\nResults for operation ${index + 1}:`);
            console.log(formatExecutionStages(result as ExecutionStages));
        });
    }
}

function formatExecutionStages(stages: ExecutionStages) {
    const { operationType, metaInfo, ...stagesData } = stages;

    return Object.entries(stagesData).map(([stage, data]) => ({
        stage: stage,
        exists: data.exists ? 'Yes' : 'No',
        success: data.exists && data.stageData ? (data.stageData.success ? 'Yes' : 'No') : '-',
        timestamp: data.exists && data.stageData ? new Date(data.stageData.timestamp * 1000).toLocaleString() : '-',
        transactions:
            data.exists &&
            data.stageData &&
            data.stageData.transactions != null &&
            data.stageData.transactions.length > 0
                ? data.stageData.transactions.map((t) => t.hash).join(' \n')
                : '-',
        noteContent: data.exists && data.stageData && data.stageData.note != null ? data.stageData.note.content : '-',
        errorName: data.exists && data.stageData && data.stageData.note != null ? data.stageData.note.errorName : '-',
        internalMsg:
            data.exists && data.stageData && data.stageData.note != null ? data.stageData.note.internalMsg : '-',
        bytesError:
            data.exists && data.stageData && data.stageData.note != null ? data.stageData.note.internalBytesError : '-',
    }));
}

function printExecutionStagesTable(stages: ExecutionStages): void {
    const table = new Table({
        head: [
            'Stage',
            'Exists',
            'Success',
            'Timestamp',
            'Transactions',
            'NoteContent',
            'ErrorName',
            'InternalMsg',
            'BytesError',
        ],
        colWidths: [30, 8, 9, 13, 70, 13, 13, 13, 13],
        wordWrap: true,
    });

    const tableData = formatExecutionStages(stages);

    tableData.forEach((row) => {
        table.push([
            row.stage,
            row.exists,
            row.success,
            row.timestamp,
            row.transactions,
            row.noteContent,
            row.errorName,
            row.internalMsg,
            row.bytesError,
        ]);
    });

    console.log(table.toString());
}
