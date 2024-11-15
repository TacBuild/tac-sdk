import { toNano } from '@ton/ton';
import { ethers } from 'ethers';
import { TacSdk } from '../src/ton/sdk/TacSdk';
import { RawSender } from '../src/ton/sender_abstraction/SenderAbstraction';
import { EvmProxyMsg, JettonTransferData, TacSDKTonClientParams, TransactionLinker, Network } from "../src/ton/structs/Struct";
import { getOperationId, getStatusTransaction } from "../src/ton/sdk/TransactionStatus"
import 'dotenv/config';

const EVM_TKA_ADDRESS = '0x7346896431955ad3bD9Fc23C8E3f0447eE1a52Cf';
const EVM_TKB_ADDRESS = '0x392D1cCB04d25fCBcA7D4fc0E429Dbc1F9fEe73F'; 
const UNISWAPV2_PROXY_ADDRESS = '0x2D478BffCEbF652e1Cb7e32Db9C674E10e873e57';

const swapUniswapRawSender = async (amountsIn: number[], amountOutMin: number, tokenAddress: string) => {
  // create TacSdk
  const tonClientParams : TacSDKTonClientParams = {
    network: Network.Testnet,
    delay: 5,
  };
  const tacSdk = new TacSdk(tonClientParams);

  var amountIn = 0;
  for (const amount of amountsIn) {
    amountIn += amount;
  }

  // create evm proxy msg
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
  const mnemonic = process.env.TVM_MNEMONICS || ''; // 24 words mnemonic
  const sender = new RawSender(mnemonic);

  // create JettonTransferData
  const jettons: JettonTransferData[] = []
  for (const amount of amountsIn) {
    jettons.push({
      fromAddress: await sender.getSenderAddress(Network.Testnet),
      tokenAddress: tokenAddress,
      jettonAmount: amount,
      tonAmount: 0.35,
    })
  }
  
  return await tacSdk.sendShardJettonTransferTransaction(jettons, evmProxyMsg, sender);
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const TERMINETED_STATUS = "TVMMerkleMessageExecuted";

async function startTracking(transactionLinker: TransactionLinker) {
  console.log("Start tracking transaction");
  console.log("caller: ", transactionLinker.caller);
  console.log("queryId: ", transactionLinker.queryId);
  console.log("shardCount: ", transactionLinker.shardCount);
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
