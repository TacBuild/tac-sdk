import { ethers } from 'ethers';

import { AssetBridgingData, EvmProxyMsg, Network, SDKParams, SenderFactory, startTracking, TacSdk } from '../../src';
import { toNano } from '@ton/ton';

const UNISWAPV2_PROXY_ADDRESS = '0x14Ad9182F54903dFD8215CA2c1aD0F9A47Ac7Edb';

const TVM_TKA_ADDRESS = 'EQBLi0v_y-KiLlT1VzQJmmMbaoZnLcMAHrIEmzur13dwOmM1';
const TVM_TKB_ADDRESS = 'EQCsQSo54ajAorOfDUAM-RPdDJgs0obqyrNSEtvbjB7hh2oK';

const WALLET_VERSION = 'v3r2';
const TVM_MNEMONICS = '';

async function addLiquidity() {
    const sdkParams: SDKParams = {
        network: Network.Testnet,
    };
    const tacSdk = await TacSdk.create(sdkParams);

    const EVM_TKA_ADDRESS = await tacSdk.getEVMTokenAddress(TVM_TKA_ADDRESS);
    console.log(EVM_TKA_ADDRESS);
    const EVM_TKB_ADDRESS = await tacSdk.getEVMTokenAddress(TVM_TKB_ADDRESS);
    console.log(EVM_TKB_ADDRESS);
    const amountA = 1;
    const amountB = 2;

    const abi = new ethers.AbiCoder();
    const encodedParameters = abi.encode(
        ['tuple(address,address,uint256,uint256,uint256,uint256,address,uint256)'],
        [
            [
                EVM_TKA_ADDRESS,
                EVM_TKB_ADDRESS,
                Number(toNano(amountA)),
                Number(toNano(amountB)),
                0, // amountAMin
                0, // amountBMin
                UNISWAPV2_PROXY_ADDRESS, // recipient
                19010987500, // deadline
            ],
        ],
    );

    const evmProxyMsg: EvmProxyMsg = {
        evmTargetAddress: UNISWAPV2_PROXY_ADDRESS,
        methodName: 'addLiquidity',
        encodedParameters,
    };

    const sender = await SenderFactory.getSender({
        network: Network.Testnet,
        version: WALLET_VERSION,
        mnemonic: TVM_MNEMONICS,
    });

    const jettons: AssetBridgingData[] = [
        {
            address: TVM_TKA_ADDRESS,
            amountWithoutDecimals: amountA,
            decimals: 9,
        },
        {
            address: TVM_TKB_ADDRESS,
            amountWithoutDecimals: amountB,
            decimals: 9,
        },
    ];

    return await tacSdk.sendCrossChainTransaction(evmProxyMsg, sender, jettons);
}

async function main() {
    try {
        // send transaction
        const result = await addLiquidity();
        console.log('Transaction successful:', result);

        // start tracking transaction status
        await startTracking(result, Network.Testnet);
    } catch (error) {
        console.error('Error during transaction:', error);
    }
}

main();
