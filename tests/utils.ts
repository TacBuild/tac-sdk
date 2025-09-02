import { ethers } from 'ethers';

import { Network, SDKParams } from '../src';

export const localSDKParams = (evmSettingsAddress: string, tvmSettingsAddress: string): SDKParams => {
    const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545/');

    return {
        network: Network.TESTNET,
        TACParams: {
            provider: provider,
            settingsAddress: evmSettingsAddress,
        },
        TONParams: {
            settingsAddress: tvmSettingsAddress,
        },
        customLiteSequencerEndpoints: ['http://localhost:8080'],
    };
};
