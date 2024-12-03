import {toNano} from '@ton/ton';
import {ethers} from 'ethers';
import {
    RawSender,
    TacSdk,
    TacSDKTonClientParams,
    Network,
    EvmProxyMsg,
    AssetOperationGeneralData,
    startTracking
} from '../src';
import 'dotenv/config';

const TVM_TKA_ADDRESS = 'EQBLi0v_y-KiLlT1VzQJmmMbaoZnLcMAHrIEmzur13dwOmM1';

const TVM_TKB_ADDRESS = 'EQCsQSo54ajAorOfDUAM-RPdDJgs0obqyrNSEtvbjB7hh2oK';

const UNISWAPV2_PROXY_ADDRESS = '0xd47Cf3c26312B645B5e7a910fCE30B46CFf6a8f8';

const swapUniswapRawSender = async (amountsIn: number[], amountOutMin: number, tokenAddress: string) => {
    // create TacSdk
    const tonClientParams: TacSDKTonClientParams = {
        network: Network.Testnet,
        delay: 5,
    };
    const tacSdk = new TacSdk(tonClientParams);
    await tacSdk.init();

    var amountIn = 0;
    for (const amount of amountsIn) {
        amountIn += amount;
    }

    const EVM_TKA_ADDRESS = await tacSdk.getEVMTokenAddress(TVM_TKA_ADDRESS);
    const EVM_TKB_ADDRESS = await tacSdk.getEVMTokenAddress(TVM_TKB_ADDRESS);

    // create evm proxy msg
    const abi = new ethers.AbiCoder();
    const encodedParameters = abi.encode(
        ['uint256', 'uint256', 'address[]', 'address', 'uint256'],
        [
            Number(toNano(amountIn)),
            Number(toNano(amountOutMin)),
            [EVM_TKA_ADDRESS, EVM_TKB_ADDRESS],
            UNISWAPV2_PROXY_ADDRESS,
            19010987500,
        ]
    );

    const evmProxyMsg: EvmProxyMsg = {
        evmTargetAddress: UNISWAPV2_PROXY_ADDRESS,
        methodName: 'swapExactTokensForTokens(uint256,uint256,address[],address,uint256)',
        encodedParameters,
    }

    // create sender abstraction
    const mnemonic = process.env.TVM_MNEMONICS || ''; // 24 words mnemonic
    const sender = new RawSender(mnemonic);

    // create JettonTransferData (transfer jetton in TVM to swap)
    const assets: AssetOperationGeneralData[] = []
    for (const amount of amountsIn) {
        assets.push({
            address: tokenAddress,
            amount: amount
        })
    }

    return await tacSdk.sendCrossChainTransaction(evmProxyMsg, sender, assets);
};

async function main() {
    try {
        // send transaction
        const result = await swapUniswapRawSender([1, 1], 0, TVM_TKA_ADDRESS);
        console.log('Transaction successful:', result);

        // start tracking transaction status
        await startTracking(result);
    } catch (error) {
        console.error('Error during transaction:', error);
    }
}

main().catch((error) => console.error('Fatal error:', error));
