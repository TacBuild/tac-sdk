import {
    IAsset,
    AssetFactory,
    AssetType,
    EvmProxyMsg,
    Network,
    NFTAddressType,
    SenderFactory,
    startTracking,
    TacSdk,
} from '../../src';
import { localSDKParams } from '../utils';

const NFT_ITEM_ADDRESS = '';
const WALLET_VERSION = 'V4';
const EVM_SEND_NFT_TO = '0xdD2FD4581271e230360230F9337D5c0430Bf44C0';
const EVM_SETTINGS_ADDRESS = '';
const TVM_SETTINGS_ADDRESS = '';

async function lock() {
    const sdkParams = localSDKParams(EVM_SETTINGS_ADDRESS, TVM_SETTINGS_ADDRESS);

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

    const nfts: IAsset[] = [
        await AssetFactory.from(tacSdk.config, {
            address: NFT_ITEM_ADDRESS,
            tokenType: AssetType.NFT,
            addressType: NFTAddressType.ITEM,
        }),
    ];

    return await tacSdk.sendCrossChainTransaction(evmProxyMsg, sender, nfts);
}

async function main() {
    try {
        const result = await lock();
        console.log('Transaction successful:', result);

        await startTracking(result, Network.TESTNET, {
            customLiteSequencerEndpoints: ['http://localhost:8080'],
        });
    } catch (error) {
        console.error('Error during transaction:', error);
    }
}

main();
