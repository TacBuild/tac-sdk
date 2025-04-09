import 'dotenv/config';

import { ethers } from 'ethers';

import { AssetBridgingData, EvmProxyMsg, Network, SDKParams, SenderFactory, startTracking, TacSdk } from '../../src';

import { toNano } from '@ton/ton';

const UNISWAPV2_PROXY_ADDRESS = '0xE72ee3E91Eb6173281E117DC041eF7AB0AAcf7c2'; // uniswap proxy address

const TVM_TKA_ADDRESS = 'EQBLi0v_y-KiLlT1VzQJmmMbaoZnLcMAHrIEmzur13dwOmM1'; // TKA
const TVM_TKB_ADDRESS = 'EQCsQSo54ajAorOfDUAM-RPdDJgs0obqyrNSEtvbjB7hh2oK'; // TKB

const WALLET_VERSION = 'V3R2';

async function addLiquidity() {
    const sdkParams: SDKParams = {
        network: Network.TESTNET,
        TACParams: {
            provider: new ethers.JsonRpcProvider('https://turin.rpc.tac.build/'),
            settingsAddress: '0xEB8E6E7632Aa97b8e93d663407C8dbD0B5112946', // set local tac settings
        },
        TONParams: {
            settingsAddress: 'EQCdbUTIKIbA4fx12LP1-23YsQh7oeSpN4noPhni2HOUTysc', // set local ton settings
        },
        customLiteSequencerEndpoints: ['http://localhost:8080'],
    };
    const tacSdk = await TacSdk.create(sdkParams);
    const EVM_TKA_ADDRESS = await tacSdk.getEVMTokenAddress(TVM_TKA_ADDRESS);
    const EVM_TKB_ADDRESS = await tacSdk.getEVMTokenAddress(TVM_TKB_ADDRESS);

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

    const mnemonic = process.env.TVM_MNEMONICS || ''; // 24 words mnemonic
    const sender = await SenderFactory.getSender({
        network: Network.TESTNET,
        version: WALLET_VERSION,
        mnemonic: mnemonic,
    });

    const jettons: AssetBridgingData[] = [
        {
            address: TVM_TKA_ADDRESS,
            amount: amountA,
        },
        {
            address: TVM_TKB_ADDRESS,
            amount: amountB,
        },
    ];
    return await tacSdk.sendCrossChainTransaction(evmProxyMsg, sender, jettons);
}

async function main() {
    try {
        // // send transaction
        const result = await addLiquidity();
        console.log('Transaction successful:', result);
        // start tracking transaction status
        await startTracking(result, Network.TESTNET, { 
            customLiteSequencerEndpoints: ['http://localhost:8080']
        });           
    } catch (error) {
        console.error('Error during transaction:', error);
    }
}

main();
