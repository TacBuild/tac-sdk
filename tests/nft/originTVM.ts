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

const NFT_ITEM_ADDRESS = 'kQBVl53XybtN96-XeT8tDl7bMLMfZxkZ9cAUxvmB5nXn0rGe';
const WALLET_VERSION = 'V4';
const EVM_SEND_NFT_TO = '0xdD2FD4581271e230360230F9337D5c0430Bf44C0';

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

    const evmProxyMsg: EvmProxyMsg = {
        evmTargetAddress: EVM_SEND_NFT_TO,
        methodName: '',
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

    return await tacSdk.sendCrossChainTransaction(evmProxyMsg, sender, nfts);
}

async function main() {
    try {
        // send transaction
        const result = await lock();
        console.log('Transaction successful:', result);

        // start tracking transaction status
        await startTracking(result, Network.TESTNET);
    } catch (error) {
        console.error('Error during transaction:', error);
    }
}

main();
