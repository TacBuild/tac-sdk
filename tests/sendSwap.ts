import { toNano } from '@ton/ton';
import { ethers } from 'ethers';
import { TacSdk } from '../src/ton/sdk/TacSdk';
import { RawSender } from '../src/ton/sender_abstraction/SenderAbstraction';
import { EvmProxyMsg, JettonTransferData, TacSDKTonClientParams, TransactionLinker } from "../src/ton/structs/Struct";
import { getOperationId, getStatusTransaction } from "../src/ton/sdk/TransactionStatus"
import 'dotenv/config';

const swapUniswapRawSender = async (amountsIn: number[], amountOutMin: number, tokenAddress: string) => {
  // create TacSdk
  const tonClientParams : TacSDKTonClientParams = {
    network: 0,
    delay: 5,
  };
  const tacSdk = new TacSdk(tonClientParams);

  // create evm proxy msg
  const EVM_TKA_ADDRESS = process.env.EVM_TKA_ADDRESS || '';
  const EVM_TKB_ADDRESS = process.env.EVM_TKB_ADDRESS || ''; 
  const UNISWAPV2_PROXY_ADDRESS = process.env.UNISWAPV2_PROXY_ADDRESS || '';

  var amountIn = 0;
  for (const amount of amountsIn) {
    amountIn += amount;
  }

  const abi = new ethers.AbiCoder();
  const encodedParameters = abi.encode(
    ['uint256', 'uint256', 'address[]', 'address', 'uint256'],
    [
      Number(toNano(amountIn)),
      Number(toNano(amountOutMin)),
      [EVM_TKA_ADDRESS, EVM_TKB_ADDRESS],
      UNISWAPV2_PROXY_ADDRESS,
      19010987500,
    ]
  );

  const evmProxyMsg: EvmProxyMsg = {
    evmTargetAddress: UNISWAPV2_PROXY_ADDRESS,
    methodName: 'swapExactTokensForTokens(uint256,uint256,address[],address,uint256)',
    encodedParameters,
  }  

  // create sender abstraction
  const mnemonic = process.env.TVM_MNEMONICS || '';
  const sender = new RawSender(mnemonic);

  // create JettonTransferData
  const jettons: JettonTransferData[] = []
  for (const amount of amountsIn) {
    jettons.push({
      fromAddress: await sender.getSenderAddress(0),
      tokenAddress: tokenAddress,
      jettonAmount: amount,
      tonAmount: 0.35,
    })
  }
  
  return await tacSdk.sendTransaction(jettons, evmProxyMsg, sender);
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const TERMINETED_STATUS = "TVMMerkleMessageExecuted";

async function startTracking(transactionLinker: TransactionLinker) {
  console.log("Start tracking transaction");
  console.log("caller: ", transactionLinker.caller);
  console.log("queryId: ", transactionLinker.query_id);
  console.log("shardCount: ", transactionLinker.shard_count);
  console.log("timestamp: ", transactionLinker.timestamp);
  var operationId = "";
  var current_status = "";
  var iteration = 0;
  var ok = true;
  while (true) {
    ++iteration;
    if (iteration >= 120) {
      ok = false;
      break;
    }
    console.log();
    if (current_status == TERMINETED_STATUS) {
      break;
    }
    if (operationId == "") {
      console.log("request operationId");
      try {
        operationId = await getOperationId(transactionLinker);
      } catch {
        console.log("get operationId error");
      }
    } else {
      try {
        current_status = await getStatusTransaction(operationId);
      } catch {
        console.log("get status error");
      }
      console.log("operationId: ", operationId);
      console.log("status: ", current_status);
      console.log("time: ", Math.floor(+new Date()/1000));
    }
    await sleep(5000);
  }
  if (!ok) {
    console.log("Finished with error");
  } else {
    console.log("Tracking successfully finished");
  }
}

async function main() {
  try {
    const result = await swapUniswapRawSender([1, 1], 0, process.env.TVM_TKA_ADDRESS || '');
    console.log('Transaction successful:', result);
    await startTracking(result.transactionLinker);
  } catch (error) {
    console.error('Error during transaction:', error);
  }
}

main().catch((error) => console.error('Fatal error:', error));
