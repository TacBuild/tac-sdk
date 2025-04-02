import 'dotenv/config';

import { ethers } from 'ethers';

import { Network, SDKParams, TacSdk } from '../src';

const tvmTargetAddress = 'EQBshzK3qgIwHozYzVAvEaOKF3YXdY1veim4XLSoNDz1oZba'; // uniswap proxy address

async function bridgeTAC() {
    const provider = new ethers.JsonRpcProvider('https://turin.rpc.tac.build/');
    const PK = process.env.PK || '';

    const signer = new ethers.Wallet(PK, provider);

    const sdkParams: SDKParams = {
        network: Network.TESTNET,
        TACParams: {
            provider: provider,
            settingsAddress: '0x4A12Ebd5058d3770F1780A3Bd4eE2faBDcB93c67', // set local tac settings
        },
        TONParams: {
            settingsAddress: 'EQCjQ_L3BmRCu4sGuI2pY6cmM1Lx5J0tLhftcfLTIN-PpJNz', // set local ton settings
        },
        customLiteSequencerEndpoints: ['http://localhost:8080'],
    };
    const tacSdk = await TacSdk.create(sdkParams);

    return await tacSdk.bridgeTokensToTON(signer, ethers.parseEther('1'), tvmTargetAddress);
}

async function main() {
    try {
        // // send transaction
        const result = await bridgeTAC();
        console.log('Transaction successful:', result);
        // start tracking transaction status
    } catch (error) {
        console.error('Error during transaction:', error);
    }
}

main();
