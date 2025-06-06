import 'dotenv/config';

import { toNano } from '@ton/ton';
import { ethers } from 'ethers';

import { AssetBridgingData, AssetType, EvmProxyMsg, Network, SDKParams, SenderFactory, startTracking, TacSdk } from '../../src';

const TVM_TKA_ADDRESS = 'EQBLi0v_y-KiLlT1VzQJmmMbaoZnLcMAHrIEmzur13dwOmM1';

const TVM_TKB_ADDRESS = 'EQCsQSo54ajAorOfDUAM-RPdDJgs0obqyrNSEtvbjB7hh2oK';

const UNISWAPV2_PROXY_ADDRESS = '0x14Ad9182F54903dFD8215CA2c1aD0F9A47Ac7Edb';

const WALLET_VERSION = 'V3R2';
const mnemonic = process.env.TVM_MNEMONICS || ''; // 24 words mnemonic

const swapUniswapRawSender = async (amountsIn: number[], amountOutMin: number, tokenAddress: string) => {
    // create TacSdk
    const sdkParams: SDKParams = {
        network: Network.TESTNET,
    };
    const tacSdk = await TacSdk.create(sdkParams);

    let amountIn = 0;
    for (const amount of amountsIn) {
        amountIn += amount;
    }

    const EVM_TKA_ADDRESS = await tacSdk.getEVMTokenAddress(TVM_TKA_ADDRESS);
    const EVM_TKB_ADDRESS = await tacSdk.getEVMTokenAddress(TVM_TKB_ADDRESS);

    // create evm proxy msg
    const abi = new ethers.AbiCoder();
    const encodedParameters = abi.encode(
        ['tuple(uint256,uint256,address[],address,uint256'],
        [
            Number(toNano(amountIn)),
            Number(toNano(amountOutMin)),
            [EVM_TKA_ADDRESS, EVM_TKB_ADDRESS],
            UNISWAPV2_PROXY_ADDRESS,
            19010987500,
        ],
    );

    const evmProxyMsg: EvmProxyMsg = {
        evmTargetAddress: UNISWAPV2_PROXY_ADDRESS,
        methodName: 'swapExactTokensForTokens',
        encodedParameters,
    };

    // create sender abstraction
    const sender = await SenderFactory.getSender({
        network: Network.TESTNET,
        version: WALLET_VERSION,
        mnemonic,
    });

    // create JettonTransferData (transfer jetton in TVM to swap)
    const assets: AssetBridgingData[] = [];
    for (const amount of amountsIn) {
        assets.push({
            address: tokenAddress,
            amount: amount,
            type: AssetType.FT,
        });
    }

    const result = await tacSdk.sendCrossChainTransaction(evmProxyMsg, sender, assets);
    tacSdk.closeConnections();
    return result;
};

async function main() {
    try {
        // send transaction
        const result = await swapUniswapRawSender([1, 1], 0, TVM_TKA_ADDRESS);
        console.log('Transaction successful:', result);

        // start tracking transaction status
        await startTracking(result, Network.TESTNET);
    } catch (error) {
        console.error('Error during transaction:', error);
    }
}

main().catch((error) => console.error('Fatal error:', error));
