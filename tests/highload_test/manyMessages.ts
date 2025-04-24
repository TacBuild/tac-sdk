import { ethers } from 'ethers';
import {
    SDKParams,
    TacSdk,
    Network,
    SenderFactory,
    EvmProxyMsg,
    AssetBridgingData,
    AssetType,
    startTracking,
    CrosschainTx,
} from '../../src';
import { localSDKParams } from '../utils';
import { toNano } from '@ton/ton';

const EVM_SETTINGS_ADDRESS = '0x87B6a0ab90d826189cC004Dc2ff16E2b472309db';
const TVM_SETTINGS_ADDRESS = 'EQA7Z2R39FUUtCJOdmTrmjrNsNoJGjdSdWGiRfVW3WLRmZ1c';

const TVM_TKA_ADDRESS = 'EQBLi0v_y-KiLlT1VzQJmmMbaoZnLcMAHrIEmzur13dwOmM1'; // TKA
const TVM_TKB_ADDRESS = 'EQCsQSo54ajAorOfDUAM-RPdDJgs0obqyrNSEtvbjB7hh2oK'; // TKB

const UNISWAPV2_PROXY_ADDRESS = '0xAAF23F0894f8CaE3051207D82588EcFff9531358'; // uniswap proxy address

async function main() {
    const sdkParams = localSDKParams(EVM_SETTINGS_ADDRESS, TVM_SETTINGS_ADDRESS);
    const tacSdk = await TacSdk.create(sdkParams);
    const sender = await SenderFactory.getSender({
        network: Network.TESTNET,
        version: 'HIGHLOAD_V3',
        mnemonic: '',
        options: {
            highloadV3: {
                subwalletId: 698983191,
            },
        },
    });
    console.log(sender.getSenderAddress());

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
    let evmProxyMsg: EvmProxyMsg = {
        evmTargetAddress: UNISWAPV2_PROXY_ADDRESS,
        methodName: 'addLiquidity',
        encodedParameters,
    };
    const jettons: AssetBridgingData[] = [
        {
            address: TVM_TKA_ADDRESS,
            amount: amountA,
            type: AssetType.FT,
        },
        {
            address: TVM_TKB_ADDRESS,
            amount: amountB,
            type: AssetType.FT,
        },
    ];

    // 20 Jetton transfers
    const txs: CrosschainTx[] = Array.from({ length: 20 }, () => ({
        evmProxyMsg,
        assets: jettons,
    }));

    // 20 TON transfers
    evmProxyMsg = {
        evmTargetAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    };
    for (let i = 0; i < 20; i++) {
        txs.push({
            evmProxyMsg,
            assets: [{ amount: 0.001, type: AssetType.FT }],
        });
    }

    await tacSdk.sendCrossChainTransactions(sender, txs);
}

main();
