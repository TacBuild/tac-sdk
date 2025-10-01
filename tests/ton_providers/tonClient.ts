import { TonClient } from '@ton/ton';

import { AssetFactory, AssetType, Network, TacSdk } from '../../src';

async function main() {
    const sdk = await TacSdk.create({
        network: Network.TESTNET,
        delay: 1,
        TONParams: {
            contractOpener: new TonClient({
                endpoint: 'http://toncenter.turin.tac.build/jsonRPC',
                // apiKey: "your_api_key"
            }),
        },
    });

    const token = await AssetFactory.from(sdk.config, {
        address: 'EQCsQSo54ajAorOfDUAM-RPdDJgs0obqyrNSEtvbjB7hh2oK',
        tokenType: AssetType.FT,
    });

    console.log(await token.getEVMAddress());
}

main();
