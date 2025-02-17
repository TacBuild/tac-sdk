import { ethers } from 'ethers';

import { AssetBridgingData, EvmProxyMsg, Network, SDKParams, SenderFactory, startTracking, TacSdk } from '../../src';

import { toNano } from '@ton/ton';

const UNISWAPV2_PROXY_ADDRESS = ''; // uniswap proxy address

const TVM_TKA_ADDRESS = 'EQBLi0v_y-KiLlT1VzQJmmMbaoZnLcMAHrIEmzur13dwOmM1'; // TKA
const TVM_TKB_ADDRESS = 'EQCsQSo54ajAorOfDUAM-RPdDJgs0obqyrNSEtvbjB7hh2oK'; // TKB

const WALLET_VERSION = 'v3r2';
const TVM_MNEMONICS = ''; // mnemonic

async function addLiquidity() {
    const sdkParams: SDKParams = {
        network: Network.Testnet,
        TACParams: {
            provider: new ethers.JsonRpcProvider("https://turin.rpc.tac.build/"),
            settingsAddress: "", // set local tac settings
        },
        TONParams: {
            settingsAddress: "EQA4c4YONqc9nfoadZ5L5uRfnCM8KW5FRVKOYTXXFjxihnms",
        },
        customLiteSequencerEndpoints: ['http://localhost:8080'],
    };
    const tacSdk = await TacSdk.create(sdkParams);

    const EVM_TKA_ADDRESS = ""; // hardcode paired evm address for TKA (or calculate them)
    console.log(EVM_TKA_ADDRESS);
    const EVM_TKB_ADDRESS = ""; // hardcode paired evm address for TKB (or calculate them)
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
        await startTracking(result, Network.Testnet, false, ['http://localhost:8080']);
    } catch (error) {
        console.error('Error during transaction:', error);
    }
}

main();
