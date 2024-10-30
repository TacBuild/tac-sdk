import { toNano } from '@ton/ton';
import type { TonConnectUI } from '@tonconnect/ui';
import { Contract, ethers } from 'ethers';
import { CHAIN } from '@tonconnect/ui';
import { TacSdk } from './src/ton/sdk/TacSdk';
import type { JettonProxyMsgParameters } from './src/ton/sdk/TacSdk';

import { TONCENTER_URL_ENDPOINT } from "./utils/ton-utils";

export const useSwap = () => {
  let contract: Contract;
  const swap = async (tonConnect: TonConnectUI, fromAddress: string, amountIn: number | string, amountOutMin: number | string, sendTo: string, deadline: number) => {
    const abi = new ethers.AbiCoder();

    const encodedParameters = abi.encode(
      ['uint256', 'uint256', 'address[]', 'address', 'uint256'],
      [
        amountIn,
        amountOutMin,
        [process.env.EVM_TKA_ADDRESS, process.env.EVM_TKB_ADDRESS],
        sendTo,
        deadline,
      ]
    );
    const UNISWAPV2_PROXY_ADDRESS = process.env.UNISWAPV2_PROXY_ADDRESS;

    if (!UNISWAPV2_PROXY_ADDRESS) {
        throw new Error("Environment variable UNISWAPV2_PROXY_ADDRESS is missing");
    }
    
    const EVM_TKA_ADDRESS = process.env.EVM_TKA_ADDRESS;

    if (!EVM_TKA_ADDRESS) {
        throw new Error("Environment variable EVM_TKA_ADDRESS is missing");
    }
    const params: JettonProxyMsgParameters = {
      fromAddress,
      jettonAmount: Number(amountIn),
      proxyMsg: {
        evmTargetAddress: UNISWAPV2_PROXY_ADDRESS,
        methodName: 'swapExactTokensForTokens(uint256,uint256,address[],address,uint256)',
        encodedParameters
      },
      tokenAddress: EVM_TKA_ADDRESS,
      tonConnect,
      tonAmount: 0.35
    };

    const tacSdk = new TacSdk({
      tonClientParameters: {
        endpoint: TONCENTER_URL_ENDPOINT
      },
      network: CHAIN.TESTNET
    });

    return await tacSdk.sendJettonWithProxyMsg(params);
  };

  return {
    swap,
  };
};
