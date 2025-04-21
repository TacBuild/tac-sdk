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

const NFT_ITEM_ADDRESS = 'kQAmOCz1vNEZBSlEpXUHZA7HEFvPaQG2OdF9A7FhI7hIwLv6';
const WALLET_VERSION = 'V4';
const TEST_PROXY_ADDRESS = '0xAB64ECF19075c7758694396D23638bA5baeAa83C';

async function lock() {
    // lock nft first
    const sdkParams: SDKParams = {
        network: Network.TESTNET,
        TACParams: {
            provider: new ethers.JsonRpcProvider('http://127.0.0.1:8545/'),
            settingsAddress: '0x87B6a0ab90d826189cC004Dc2ff16E2b472309db', // set local tac settings
        },
        TONParams: {
            settingsAddress: 'EQA7Z2R39FUUtCJOdmTrmjrNsNoJGjdSdWGiRfVW3WLRmZ1c', // set local ton settings
        },
        customLiteSequencerEndpoints: ['http://localhost:8080'],
    };

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
