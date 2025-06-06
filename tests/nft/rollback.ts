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
} from '../../src';
import { localSDKParams } from '../utils';

const NFT_ITEM_ADDRESS = '';
const WALLET_VERSION = 'V4';
const TEST_PROXY_ADDRESS = '';
const EVM_SETTINGS_ADDRESS = '';
const TVM_SETTINGS_ADDRESS = '';

async function lock() {
    const sdkParams = localSDKParams(EVM_SETTINGS_ADDRESS, TVM_SETTINGS_ADDRESS);

    const tacSdk = await TacSdk.create(sdkParams);

    const abi = new ethers.AbiCoder();
    const encodedParameters = abi.encode(['string'], ['test_rollback_error']);

    const evmProxyMsg: EvmProxyMsg = {
        evmTargetAddress: TEST_PROXY_ADDRESS,
        methodName: 'mockWithDefaultError',
        encodedParameters,
    };

    const mnemonic = process.env.TVM_MNEMONICS || ''; // 24 words mnemonic
    const sender = await SenderFactory.getSender({
        network: Network.TESTNET,
        version: WALLET_VERSION,
        mnemonic: mnemonic,
    });

    const nfts: AssetBridgingData[] = [
        {
            address: NFT_ITEM_ADDRESS,
            amount: 1,
            type: AssetType.NFT,
        },
    ];

    return await tacSdk.sendCrossChainTransaction(evmProxyMsg, sender, nfts, {
        forceSend: true,
        evmExecutorFee: 30_000_000n,
        tvmExecutorFee: 300_000_000n,
        isRoundTrip: true,
    });
}

async function main() {
    try {
        // send transaction
        const result = await lock();
        console.log('Transaction successful:', result);

        // start tracking transaction status
        await startTracking(result, Network.TESTNET, {
            customLiteSequencerEndpoints: ['http://localhost:8080'],
        });
    } catch (error) {
        console.error('Error during transaction:', error);
    }
}

main();
