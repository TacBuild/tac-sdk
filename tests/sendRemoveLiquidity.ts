import { ethers } from "ethers";
import { TacSdk } from "../src/ton/sdk/TacSdk";
import {
  EvmProxyMsg,
  JettonOpGeneralData,
  Network,
  TacSDKTonClientParams,
} from "../src/ton/structs/Struct";
import { RawSender } from "../src/ton/sender_abstraction/SenderAbstraction";

const UNISWAPV2_PROXY_ADDRESS = "";

const TVM_LP_ADDRESS = "";
const EVM_TKA_ADDRESS = "";
const EVM_TKB_ADDRESS = "";

const TVM_MNEMONICS = "";

async function main() {
  const tonClientParams: TacSDKTonClientParams = {
    network: Network.Testnet,
    delay: 3,
  };
  const tacSdk = new TacSdk(tonClientParams);

  const amountLP = 1;

  const abi = new ethers.AbiCoder();
  const encodedParameters = abi.encode(
    [
      "address",
      "address",
      "uint256",
      "uint256",
      "uint256",
      "address",
      "uint256",
    ],
    [
      EVM_TKA_ADDRESS,
      EVM_TKB_ADDRESS,
      amountLP, // liquidity
      0, // amountAMin
      0, // amountBMin
      UNISWAPV2_PROXY_ADDRESS, // recipient
      19010987500, // deadline
    ]
  );

  const evmProxyMsg: EvmProxyMsg = {
    evmTargetAddress: UNISWAPV2_PROXY_ADDRESS,
    methodName:
      "removeLiquidity(address,address,uint256,uint256,uint256,address,uint256)",
    encodedParameters,
  };

  const sender = new RawSender(TVM_MNEMONICS);

  const jettons: JettonOpGeneralData[] = [];
  jettons.push({
    fromAddress: await sender.getSenderAddress(Network.Testnet),
    tokenAddress: TVM_LP_ADDRESS,
    jettonAmount: amountLP,
    tonAmount: 0.4,
  });

  return await tacSdk.sendCrossChainJettonTransaction(
    jettons,
    evmProxyMsg,
    sender
  );
}

main();
