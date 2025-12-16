import { AssetFactory, AssetType, Network, TacSdk, tonClientOpener } from '../../src';

async function main() {
    const contractOpener = tonClientOpener('http://toncenter.turin.tac.build/jsonRPC');
    const sdk = await TacSdk.create({
        network: Network.TESTNET,
        delay: 1,
        TONParams: {
            contractOpener,
        },
    });

    const token = await AssetFactory.from(sdk.config, {
        address: 'EQCsQSo54ajAorOfDUAM-RPdDJgs0obqyrNSEtvbjB7hh2oK',
        tokenType: AssetType.FT,
    });

    console.log(await token.getEVMAddress());
}

main();
