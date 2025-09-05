import 'dotenv/config';

import { AssetType, EvmProxyMsg, Network, SDKParams, SenderFactory, startTracking, TacSdk } from '../src';
import { defaultWaitOptions } from '../src';
import { AssetFactory, ConsoleLogger } from '../src';

const bridgeTonSawSender = async (amount: number) => {
    // create TacSdk
    const sdkParams: SDKParams = {
        network: Network.TESTNET,
    };
    const tacSdk = await TacSdk.create(sdkParams, new ConsoleLogger());

    // create evm proxy msg
    const evmProxyMsg: EvmProxyMsg = {
        evmTargetAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    };

    // create sender abstraction
    const mnemonic = process.env.TVM_MNEMONICS || ''; // 24 words mnemonic
    const sender = await SenderFactory.getSender({
        network: Network.TESTNET,
        version: 'V3R2',
        mnemonic,
    });

    console.log(sender.getSenderAddress());

    // create JettonTransferData (transfer jetton in TVM to swap)
    const assets = [
        await (
            await AssetFactory.from(tacSdk.config, { address: tacSdk.config.nativeTONAddress, tokenType: AssetType.FT })
        ).withAmount({ amount: amount }),
        await (
            await AssetFactory.from(tacSdk.config, { address: tacSdk.config.nativeTONAddress, tokenType: AssetType.FT })
        ).withAmount({ amount: amount }),
        await (
            await AssetFactory.from(tacSdk.config, { address: tacSdk.config.nativeTONAddress, tokenType: AssetType.FT })
        ).withAmount({ amount: amount }),
    ];

    const result = await tacSdk.sendCrossChainTransaction(
        evmProxyMsg,
        sender,
        assets,
        { allowSimulationError: true },
        defaultWaitOptions,
    );

    tacSdk.closeConnections();

    return result;
};

async function main() {
    try {
        // send transaction
        const result = await bridgeTonSawSender(0.0012);
        console.log('Transaction successful:', result);

        // start tracking transaction status
        await startTracking(result, Network.TESTNET);
    } catch (error) {
        console.error('Error during transaction:', error);
    }

    return;
}

main().catch((error) => console.error('Fatal error:', error));
