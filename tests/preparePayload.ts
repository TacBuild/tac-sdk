import { toNano } from '@ton/ton';

import { AssetLike, AssetType, ConsoleLogger, EvmProxyMsg, Network, SDKParams, TacSdk } from '../src';

async function preparePayload() {
    const sdkParams: SDKParams = {
        network: Network.TESTNET,
    };
    const tacSdk = await TacSdk.create(sdkParams, new ConsoleLogger());

    const evmProxyMsg: EvmProxyMsg = {
        evmTargetAddress: '0x0000000000000000000000000000000000000001',
    };

    const assets: AssetLike[] = [
        {
            type: AssetType.FT,
            rawAmount: toNano(1),
        },
    ];

    const res = await tacSdk.prepareCrossChainTransactionPayload(
        evmProxyMsg,
        '0:0000000000000000000000000000000000000000000000000000000000000000',
        assets,
    );

    console.log(res);

    console.log(
        `https://app.tonkeeper.com/transfer/${res[0].destinationAddress}?amount=${res[0].tonAmount}&bin=${res[0].body.toBoc().toString('base64url')}`,
    );
}

preparePayload();
