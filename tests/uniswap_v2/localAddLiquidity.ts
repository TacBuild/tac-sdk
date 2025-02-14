import { ethers } from 'ethers';

import { AssetBridgingData, EvmProxyMsg, Network, SDKParams, SenderFactory, startTracking, TacSdk } from '../../src';
import { toNano, TonClient } from '@ton/ton';

const UNISWAPV2_PROXY_ADDRESS = '0x1e8B741cecF886F3C3ba6fC53e372F4584bD3A0a';

const TVM_TKA_ADDRESS = 'EQBLi0v_y-KiLlT1VzQJmmMbaoZnLcMAHrIEmzur13dwOmM1';
const TVM_TKB_ADDRESS = 'EQCsQSo54ajAorOfDUAM-RPdDJgs0obqyrNSEtvbjB7hh2oK';

const WALLET_VERSION = 'v3r2';
const TVM_MNEMONICS = '';

async function addLiquidity() {
    const sdkParams: SDKParams = {
        network: Network.Testnet,
        TACParams: {
            provider: new ethers.JsonRpcProvider("https://turin.rpc.tac.build/"),
            settingsAddress: "",
        },
        TONParams: {
            settingsAddress: "",
            contractOpener: new TonClient({
                endpoint: "https://testnet.toncenter.com/api/v2/jsonRPC",
              })
        },
        customLiteSequencerEndpoints: ['http://localhost:8080'],
        delay: 2,
    };
    const tacSdk = await TacSdk.create(sdkParams);

    const EVM_TKA_ADDRESS = "0x62646a91Bb58B09Af104062c67e14Cf3b2EC1FF3";
    console.log(EVM_TKA_ADDRESS);
    const EVM_TKB_ADDRESS = "0x7428F78f86C5cFF0538783B50730379D28DBFcfe";
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
        // send transaction
        const result = await addLiquidity();
        console.log('Transaction successful:', result);

        // start tracking transaction status

        await startTracking(result, Network.Testnet, false, ['http://localhost:8080']);
    } catch (error) {
        console.error('Error during transaction:', error);
    }
}

main();
