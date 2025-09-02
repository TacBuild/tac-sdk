import { AssetFactory, AssetType, liteClientOpener, Network, TacSdk } from '../../src';

async function main() {
    const sdk = await TacSdk.create({
        network: Network.TESTNET,
        TONParams: {
            contractOpener: await liteClientOpener({ network: Network.TESTNET }),
        },
    });

    const token = await AssetFactory.from(sdk.config, {
        address: 'EQCsQSo54ajAorOfDUAM-RPdDJgs0obqyrNSEtvbjB7hh2oK',
        tokenType: AssetType.FT,
    });

    console.log(await token.getEVMAddress());

    sdk.closeConnections();
}

main();
