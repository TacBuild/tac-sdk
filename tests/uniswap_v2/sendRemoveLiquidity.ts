import { ethers } from 'ethers';

import { AssetBridgingData, EvmProxyMsg, Network, SDKParams, SenderFactory, startTracking, TacSdk } from '../../src';
import { toNano } from '@ton/ton';

const UNISWAPV2_PROXY_ADDRESS = '0x14Ad9182F54903dFD8215CA2c1aD0F9A47Ac7Edb';

const TVM_LP_ADDRESS = '';

const TVM_TKA_ADDRESS = 'EQBLi0v_y-KiLlT1VzQJmmMbaoZnLcMAHrIEmzur13dwOmM1';
const TVM_TKB_ADDRESS = 'EQCsQSo54ajAorOfDUAM-RPdDJgs0obqyrNSEtvbjB7hh2oK';

const WALLET_VERSION = 'v3r2';
const TVM_MNEMONICS = process.env.TVM_MNEMONICS || '';

async function removeLiquidity() {
    const sdkParams: SDKParams = {
        network: Network.Testnet,
    };
    const tacSdk = await TacSdk.create(sdkParams);

    const amountLP = 1;
    const EVM_TKA_ADDRESS = await tacSdk.getEVMTokenAddress(TVM_TKA_ADDRESS);
    const EVM_TKB_ADDRESS = await tacSdk.getEVMTokenAddress(TVM_TKB_ADDRESS);

    const abi = new ethers.AbiCoder();
    const encodedParameters = abi.encode(
        ['tuple(address,address,uint256,uint256,uint256,address,uint256)'],
        [
            [
                EVM_TKA_ADDRESS,
                EVM_TKB_ADDRESS,
                Number(toNano(amountLP)), // liquidity
                0, // amountAMin
                0, // amountBMin
                UNISWAPV2_PROXY_ADDRESS, // recipient
                19010987500, // deadline
            ],
        ],
    );

    const evmProxyMsg: EvmProxyMsg = {
        evmTargetAddress: UNISWAPV2_PROXY_ADDRESS,
        methodName: 'removeLiquidity',
        encodedParameters,
    };

    const sender = await SenderFactory.getSender({
        network: Network.Testnet,
        version: WALLET_VERSION,
        mnemonic: TVM_MNEMONICS,
    });

    const assets: AssetBridgingData[] = [
        {
            address: TVM_LP_ADDRESS,
            amount: amountLP,
            decimals: 9,
        },
    ];

    const result = await tacSdk.sendCrossChainTransaction(evmProxyMsg, sender, assets);
    tacSdk.closeConnections();
    return result;
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
