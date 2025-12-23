import { ILogger } from '../interfaces';
import { ITxFinalizer } from '../interfaces/ITxFinalizer';
import { ExecutionStages, Network, OperationType, TransactionLinker } from '../structs/Struct';
import { MAX_ITERATION_COUNT } from './Consts';
import { NoopLogger } from './Logger';
import { OperationTracker } from './OperationTracker';
import { sleep } from './Utils';

export async function startTracking(
    transactionLinker: TransactionLinker,
    network: Network,
    options?: {
        customLiteSequencerEndpoints?: string[];
        delay?: number;
        maxIterationCount?: number;
        returnValue?: boolean;
        tableView?: boolean;
        logger?: ILogger;
        txFinalizer?: ITxFinalizer;
        cclAddress?: string;
    },
): Promise<void | ExecutionStages> {
    const {
        customLiteSequencerEndpoints,
        delay = 10,
        maxIterationCount = MAX_ITERATION_COUNT,
        returnValue = false,
        tableView = true,
        logger = new NoopLogger(),
        txFinalizer,
        cclAddress,
    } = options || {};

    const tracker = new OperationTracker(network, customLiteSequencerEndpoints, logger);

    logger.debug('Start tracking operation');
    logger.debug('caller: ' + transactionLinker.caller);
    logger.debug('shardsKey: ' + transactionLinker.shardsKey);
    logger.debug('shardCount: ' + transactionLinker.shardCount);
    logger.debug('timestamp: ' + transactionLinker.timestamp);

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
            logger.debug('request operationId');

            try {
                operationId = await tracker.getOperationId(transactionLinker);
            } catch {
                // Ignore error and continue
            }
        } else {
            try {
                operationType = await tracker.getOperationType(operationId);
                if (operationType != OperationType.PENDING && operationType != OperationType.UNKNOWN) {
                    break;
                }
            } catch (err) {
                logger.debug('failed to get operation type: ' + err);
            }

            logger.debug(`
                operationId: ${operationId}
                operationType: ${operationType}
                time: ${new Date().toISOString()} (${Math.floor(+new Date() / 1000)})
            `);
        }
        await sleep(delay * 1000);
    }

    logger.debug('Tracking finished');
    if (!ok) {
        if (returnValue) {
            throw Error(errorMessage);
        }
        logger.debug(errorMessage);
    }

    const profilingData = await tracker.getStageProfiling(operationId);

    // Check if EXECUTED_IN_TON stage exists and use TxFinalizer to verify transaction success
    if (profilingData.executedInTON.exists && profilingData.executedInTON.stageData?.transactions) {
        logger.debug('EXECUTED_IN_TON stage found, verifying transaction success in TON...');

        if (txFinalizer && cclAddress) {
            const transactions = profilingData.executedInTON.stageData.transactions;
            for (const tx of transactions) {
                try {
                    logger.debug(`Verifying transaction: ${tx.hash}`);
                    await txFinalizer.trackTransactionTree(cclAddress, tx.hash, { maxDepth: 10 });
                    logger.debug(`Transaction ${tx.hash} verified successfully in TON`);
                } catch (error) {
                    logger.debug(`Transaction ${tx.hash} failed verification in TON: ${error}`);
                    if (returnValue) {
                        throw error;
                    }
                }
            }
        } else {
            logger.debug('TxFinalizer config not provided, skipping TON transaction verification');
        }
    }

    if (returnValue) {
        return profilingData;
    }

    logger.debug(profilingData.operationType);
    logger.debug(profilingData.metaInfo);
    if (tableView) {
        printExecutionStagesTable(profilingData, logger);
    } else {
        logger.debug(formatExecutionStages(profilingData));
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
        logger?: ILogger;
        txFinalizer?: ITxFinalizer;
    },
): Promise<void | ExecutionStages[]> {
    const {
        customLiteSequencerEndpoints,
        delay = 10,
        maxIterationCount = MAX_ITERATION_COUNT,
        returnValue = false,
        tableView = true,
        txFinalizer,
        logger = new NoopLogger(),
    } = options || {};

    logger.debug(`Start tracking ${transactionLinkers.length} operations`);

    const results = await Promise.all(
        transactionLinkers.map((linker, index) => {
            logger.debug(`\nProcessing operation ${index + 1}/${transactionLinkers.length}`);
            return startTracking(linker, network, {
                customLiteSequencerEndpoints,
                delay,
                maxIterationCount,
                returnValue: true,
                tableView: false,
                txFinalizer,
                logger,
            });
        }),
    );

    if (returnValue) {
        return results as ExecutionStages[];
    }

    if (tableView) {
        results.forEach((result, index) => {
            logger.debug(`\nResults for operation ${index + 1}:`);
            printExecutionStagesTable(result as ExecutionStages, logger);
        });
    } else {
        results.forEach((result, index) => {
            logger.debug(`\nResults for operation ${index + 1}:`);
            logger.debug(formatExecutionStages(result as ExecutionStages));
        });
    }
}

function formatExecutionStages(stages: ExecutionStages) {
    const {
        collectedInTAC,
        includedInTACConsensus,
        executedInTAC,
        collectedInTON,
        includedInTONConsensus,
        executedInTON,
    } = stages;

    return Object.entries({
        collectedInTAC,
        includedInTACConsensus,
        executedInTAC,
        collectedInTON,
        includedInTONConsensus,
        executedInTON,
    }).map(([stage, data]) => ({
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

/**
 * Simple table formatter that works in both browser and Node.js without external dependencies
 */
function createSimpleTable(headers: string[], rows: string[][], colWidths: number[]): string {
    const lines: string[] = [];

    // Helper to truncate and pad text to fit column width
    const fitToWidth = (text: string, width: number): string => {
        // Handle multi-line text by taking only the first line for table cell
        const firstLine = text.split('\n')[0];
        if (firstLine.length > width - 2) {
            return firstLine.substring(0, width - 5) + '...';
        }
        return firstLine.padEnd(width, ' ');
    };

    // Create separator line
    const separator = '+' + colWidths.map((w) => '-'.repeat(w)).join('+') + '+';

    // Create header row
    const headerRow = '|' + headers.map((h, i) => fitToWidth(h, colWidths[i])).join('|') + '|';

    lines.push(separator);
    lines.push(headerRow);
    lines.push(separator);

    // Create data rows
    rows.forEach((row) => {
        const dataRow = '|' + row.map((cell, i) => fitToWidth(cell, colWidths[i])).join('|') + '|';
        lines.push(dataRow);
    });

    lines.push(separator);

    return lines.join('\n');
}

export function printExecutionStagesTable(stages: ExecutionStages, logger: ILogger): void {
    const headers = [
        'Stage',
        'Exists',
        'Success',
        'Timestamp',
        'Transactions',
        'NoteContent',
        'ErrorName',
        'InternalMsg',
        'BytesError',
    ];

    const colWidths = [30, 8, 9, 13, 70, 13, 13, 13, 13];

    const tableData = formatExecutionStages(stages);

    const rows = tableData.map((row) => [
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

    const table = createSimpleTable(headers, rows, colWidths);
    logger.debug(table);
}
