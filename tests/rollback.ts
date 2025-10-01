import { ethers } from 'ethers';

import {
    Asset,
    AssetFactory,
    AssetType,
    EvmProxyMsg,
    Network,
    SDKParams,
    SenderFactory,
    startTracking,
    TacSdk,
} from '../src';

const TEST_PROXY = '';
const TVM_TKA_ADDRESS = 'EQBLi0v_y-KiLlT1VzQJmmMbaoZnLcMAHrIEmzur13dwOmM1';
const amountA = 1;

const WALLET_VERSION = 'V3R2';

async function rollback() {
    const mnemonic = process.env.TVM_MNEMONICS || ''; // 24 words mnemonic
    const sender = await SenderFactory.getSender({
        network: Network.TESTNET,
        version: WALLET_VERSION,
        mnemonic: mnemonic,
    });

    const sdkParams: SDKParams = {
        network: Network.TESTNET,
        TACParams: {
            settingsAddress: '', // set local tac settings
        },
        TONParams: {
            settingsAddress: '', // set local ton settings
        },
        customLiteSequencerEndpoints: ['http://localhost:8080'],
    };
    const tacSdk = await TacSdk.create(sdkParams);

    const token = (
        await AssetFactory.from(tacSdk.config, { address: TVM_TKA_ADDRESS, tokenType: AssetType.FT })
    ).withAmount(amountA);

    const abi = new ethers.AbiCoder();
    const encodedParameters = abi.encode(['string'], [`error`]);

    const evmProxyMsg: EvmProxyMsg = {
        evmTargetAddress: TEST_PROXY,
        methodName: 'mockWithDefaultError(bytes,bytes)',
        encodedParameters,
    };

    const jettons: Asset[] = [token];

    return await tacSdk.sendCrossChainTransaction(evmProxyMsg, sender, jettons, {
        allowSimulationError: true,
        isRoundTrip: true,
        evmExecutorFee: 1_000_000_000n,
    });
}

async function main() {
    try {
        // send transaction
        const result = await rollback();
        console.log('Transaction successful:', result);

        // start tracking transaction status
        await startTracking(result, Network.TESTNET, { customLiteSequencerEndpoints: ['http://localhost:8080'] });
    } catch (error) {
        console.error('Error during transaction:', error);
    }
}

main();
