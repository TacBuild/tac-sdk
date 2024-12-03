import {ethers} from "ethers";
import {
    EvmProxyMsg,
    AssetBridgingData,
    Network,
    TacSDKTonClientParams, TacSdk, RawSender, startTracking,
} from "../src";

const UNISWAPV2_PROXY_ADDRESS = "";

const TVM_LP_ADDRESS = "";
const EVM_TKA_ADDRESS = "";
const EVM_TKB_ADDRESS = "";

const TVM_MNEMONICS = "";

async function removeLiquidity() {
    const tonClientParams: TacSDKTonClientParams = {
        network: Network.Testnet,
        delay: 3,
    };
    const tacSdk = new TacSdk(tonClientParams);
    await tacSdk.init();

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

    const jettons: AssetBridgingData[] = [];
    jettons.push({
        address: TVM_LP_ADDRESS,
        amount: amountLP
    });

    return await tacSdk.sendCrossChainTransaction(
        evmProxyMsg,
        sender,
        jettons,
    );
}

async function main() {
    try {
        // send transaction
        const result = await removeLiquidity();
        console.log('Transaction successful:', result);

        // start tracking transaction status
        await startTracking(result);
    } catch (error) {
        console.error('Error during transaction:', error);
    }
}

main();
