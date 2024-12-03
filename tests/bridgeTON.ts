import {
    EvmProxyMsg,
    RawSender,
    TacSdk,
    TacSDKTonClientParams,
    Network,
    AssetOperationGeneralData,
    startTracking
} from '../src';
import 'dotenv/config';

const bridgeTonSawSender = async (amount: number) => {
    // create TacSdk
    const tonClientParams: TacSDKTonClientParams = {
        network: Network.Testnet,
        delay: 5,
    };
    const tacSdk = new TacSdk(tonClientParams);
    await tacSdk.init();

    // create evm proxy msg
    const evmProxyMsg: EvmProxyMsg = {
        evmTargetAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
    }

    // create sender abstraction
    const mnemonic = process.env.TVM_MNEMONICS || ''; // 24 words mnemonic
    const sender = new RawSender(mnemonic);

    // create JettonTransferData (transfer jetton in TVM to swap)
    const assets: AssetOperationGeneralData[] = [{
        amount: amount
    }]

    return await tacSdk.sendCrossChainTransaction(evmProxyMsg, sender, assets);
};

async function main() {
    try {
        // send transaction
        const result = await bridgeTonSawSender(2);
        console.log('Transaction successful:', result);

        // start tracking transaction status
        await startTracking(result, true);
    } catch (error) {
        console.error('Error during transaction:', error);
    }
}

main().catch((error) => console.error('Fatal error:', error));
