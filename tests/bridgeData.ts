import 'dotenv/config';

import {ethers} from "ethers";

import {startTracking} from '../src';
import {SenderFactory, TacSdk} from '../src';
import {EvmProxyMsg, Network,TacSDKTonClientParams} from '../src';

const WALLET_VERSION = "v4";

const bridgeDataRawSender = async () => {
    // create TacSdk
    const tonClientParams: TacSDKTonClientParams = {
        network: Network.Testnet,
        delay: 5,
    };
    const tacSdk = new TacSdk(tonClientParams);
    await tacSdk.init();

    const abi = new ethers.AbiCoder();
    const encodedParameters = abi.encode(
        ['uint256'],
        [12345]
    );
    // create evm proxy msg
    const evmProxyMsg: EvmProxyMsg = {
        evmTargetAddress: "0x58EB3a28C0eD803B6aF731a72E3312f6e5503a5a",
        methodName: "set(uint256)",
        encodedParameters
    }

    // create sender abstraction
    const mnemonic = process.env.TVM_MNEMONICS || ''; // 24 words mnemonic
    const sender = await SenderFactory.getSender({
        version: WALLET_VERSION,
        mnemonic,
      });

    return await tacSdk.sendCrossChainTransaction(evmProxyMsg, sender);
};

async function main() {
    try {
        // send transaction
        const result = await bridgeDataRawSender();
        console.log('Transaction successful:', result);

        // start tracking transaction status
        await startTracking(result, true);
    } catch (error) {
        console.error('Error during transaction:', error);
    }
}

main().catch((error) => console.error('Fatal error:', error));
