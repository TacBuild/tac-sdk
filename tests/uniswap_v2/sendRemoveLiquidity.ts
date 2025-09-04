import { ethers } from 'ethers';

import {
    IAsset,
    AssetFactory,
    AssetType,
    EvmProxyMsg,
    Network,
    SDKParams,
    SenderFactory,
    startTracking,
    TacSdk,
} from '../../src';

const UNISWAPV2_PROXY_ADDRESS = '0x14Ad9182F54903dFD8215CA2c1aD0F9A47Ac7Edb';

const TVM_LP_ADDRESS = '';

const TVM_TKA_ADDRESS = 'EQBLi0v_y-KiLlT1VzQJmmMbaoZnLcMAHrIEmzur13dwOmM1';
const TVM_TKB_ADDRESS = 'EQCsQSo54ajAorOfDUAM-RPdDJgs0obqyrNSEtvbjB7hh2oK';

const WALLET_VERSION = 'V3R2';
const TVM_MNEMONICS = process.env.TVM_MNEMONICS || '';

async function removeLiquidity() {
    const sdkParams: SDKParams = {
        network: Network.TESTNET,
    };
    const tacSdk = await TacSdk.create(sdkParams);
    const sender = await SenderFactory.getSender({
        network: Network.TESTNET,
        version: WALLET_VERSION,
        mnemonic: TVM_MNEMONICS,
    });

    const amountLP = 1;

    const tokenLP = await (
        await AssetFactory.from(tacSdk.config, { address: TVM_LP_ADDRESS, tokenType: AssetType.FT })
    ).withAmount({ amount: amountLP });

    const tokenA = await AssetFactory.from(tacSdk.config, { address: TVM_TKA_ADDRESS, tokenType: AssetType.FT });
    const tokenB = await AssetFactory.from(tacSdk.config, { address: TVM_TKB_ADDRESS, tokenType: AssetType.FT });

    const EVM_TKA_ADDRESS = await tokenA.getEVMAddress();
    const EVM_TKB_ADDRESS = await tokenB.getEVMAddress();

    const abi = new ethers.AbiCoder();
    const encodedParameters = abi.encode(
        ['tuple(address,address,uint256,uint256,uint256,address,uint256)'],
        [
            [
                EVM_TKA_ADDRESS,
                EVM_TKB_ADDRESS,
                10n ** 18n, // liquidity
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

    const assets: IAsset[] = [tokenLP];

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
        await startTracking(result, Network.TESTNET);
    } catch (error) {
        console.error('Error during transaction:', error);
    }
}

main();
