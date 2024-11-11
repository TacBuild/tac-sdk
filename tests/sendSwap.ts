import { toNano } from '@ton/ton';
import { ethers } from 'ethers';
import { TacSdk } from '../src/ton/sdk/TacSdk';
import { RawSender } from '../src/ton/sender_abstaction/SenderAbstraction';
import { TONCENTER_URL_ENDPOINT } from "../utils/ton-utils";
import { EvmProxyMsg, JettonTransferData, TacSDKTonClientParams } from "../src/ton/structs/Struct";
import 'dotenv/config';

const swapUniswapRawSender = async (amountIn: number, amountOutMin: number, tokenAddress: string) => {
  // create TacSdk
  const tonClientParams : TacSDKTonClientParams = {
    network: 0,
  };
  const tacSdk = new TacSdk(tonClientParams);

  // create evm proxy msg
  const EVM_TKA_ADDRESS = process.env.EVM_TKA_ADDRESS || '';
  const EVM_TKB_ADDRESS = process.env.EVM_TKB_ADDRESS || ''; 
  const UNISWAPV2_PROXY_ADDRESS = process.env.UNISWAPV2_PROXY_ADDRESS || '';

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
  jettons.push({
    fromAddress: await sender.getSenderAddress(0),
    tokenAddress: tokenAddress,
    jettonAmount: amountIn,
    tonAmount: 0.35,
  })
  
  return await tacSdk.sendTransaction(jettons, evmProxyMsg, sender);
};

async function main() {
  try {
    const result = await swapUniswapRawSender(1, 0, process.env.TVM_TKA_ADDRESS || '');
    console.log('Transaction successful:', result);
  } catch (error) {
    console.error('Error during transaction:', error);
  }
}

main().catch((error) => console.error('Fatal error:', error));
