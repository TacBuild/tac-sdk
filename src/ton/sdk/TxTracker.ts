import { TransactionLinker } from "../structs/Struct";
import { sleep } from "./TacSdk";
import { TransactionStatus } from "./TransactionStatus";

export async function startTracking(transactionLinker: TransactionLinker) {
  const tracker = new TransactionStatus();

  console.log('Start tracking transaction');
  console.log('caller: ', transactionLinker.caller);
  console.log('queryId: ', transactionLinker.queryId);
  console.log('shardCount: ', transactionLinker.shardCount);
  console.log('timestamp: ', transactionLinker.timestamp);

  var operationId = '';
  var current_status = '';
  var iteration = 0; // number of iterations
  var ok = true; // finished successfully

  while (true) {

    ++iteration;
    if (iteration >= 120) {
      ok = false;
      break;
    }

    console.log();

    if (current_status == tracker.TERMINETED_STATUS) {
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
      console.log('request transactionStatus');

      try {
        const new_status = await tracker.getStatusTransaction(operationId);
        current_status = new_status;
      } catch {
        console.log('get status error');
      }

      console.log('operationId:', operationId);
      console.log('status: ', current_status);
      console.log('time: ', Math.floor(+new Date()/1000));
    }
    await sleep(10 * 1000);
  }

  if (!ok) {
    console.log('Finished with error');
  } else {
    console.log('Tracking successfully finished');
  }
}
