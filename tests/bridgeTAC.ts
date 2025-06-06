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
