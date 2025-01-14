import { Network, TransactionLinker } from '../structs/Struct';
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
    console.log('shardedId: ', transactionLinker.shardedId);
    console.log('shardCount: ', transactionLinker.shardCount);
    console.log('timestamp: ', transactionLinker.timestamp);

    let operationId = '';
    let currentStatus = '';
    let iteration = 0; // number of iterations
    let ok = true; // finished successfully

    while (true) {
        ++iteration;
        if (iteration >= MAX_ITERATION_COUNT) {
            ok = false;
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
                currentStatus = await tracker.getOperationStatus(operationId);
            } catch {
                console.log('get status error');
            }

            console.log('operationId:', operationId);
            console.log('status: ', currentStatus);
            console.log('time: ', Math.floor(+new Date() / 1000));
        }
        await sleep(10 * 1000);
    }

    if (!ok) {
        console.log('Finished with error');
    } else {
        console.log('Tracking successfully finished');
    }
}
