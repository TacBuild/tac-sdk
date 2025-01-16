import { ethers } from 'ethers';

import { AssetBridgingData, EvmProxyMsg, Network, SDKParams, SenderFactory, startTracking, TacSdk } from '../src';

const UNISWAPV2_PROXY_ADDRESS = '';

const TVM_LP_ADDRESS = '';
const EVM_TKA_ADDRESS = '';
const EVM_TKB_ADDRESS = '';

const WALLET_VERSION = 'v4';
const TVM_MNEMONICS = '';

async function removeLiquidity() {
    const sdkParams: SDKParams = {
        network: Network.Testnet,
    };
    const tacSdk = await TacSdk.create(sdkParams);

    const amountLP = 1;

    const abi = new ethers.AbiCoder();
    const encodedParameters = abi.encode(
        ['address', 'address', 'uint256', 'uint256', 'uint256', 'address', 'uint256'],
        [
            EVM_TKA_ADDRESS,
            EVM_TKB_ADDRESS,
            amountLP, // liquidity
            0, // amountAMin
            0, // amountBMin
            UNISWAPV2_PROXY_ADDRESS, // recipient
            19010987500, // deadline
        ],
    );

    const evmProxyMsg: EvmProxyMsg = {
        evmTargetAddress: UNISWAPV2_PROXY_ADDRESS,
        methodName: 'removeLiquidity(address,address,uint256,uint256,uint256,address,uint256)',
        encodedParameters,
    };

    const sender = await SenderFactory.getSender({
        network: Network.Testnet,
        version: WALLET_VERSION,
        mnemonic: TVM_MNEMONICS,
    });

    const jettons: AssetBridgingData[] = [];
    jettons.push({
        address: TVM_LP_ADDRESS,
        amount: amountLP,
    });

    return await tacSdk.sendCrossChainTransaction(evmProxyMsg, sender, jettons);
}

async function main() {
    try {
        // send transaction
        const result = await removeLiquidity();
        console.log('Transaction successful:', result);

        // start tracking transaction status
        await startTracking(result, Network.Testnet);
    } catch (error) {
        console.error('Error during transaction:', error);
    }
}

main();
