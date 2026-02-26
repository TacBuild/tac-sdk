import { AssetFactory, AssetType, Network, TacSdk, tonClientOpenerByUrl } from '../../src';

async function main() {
    const contractOpener = tonClientOpenerByUrl('https://rp.mainnet.tac.build/api/v2/jsonRPC');
    const sdk = await TacSdk.create({
        network: Network.MAINNET,
        delay: 1,
        TONParams: {
            contractOpener,
        },
    });

    // const token = await AssetFactory.from(sdk.config, {
    //     address: 'EQCsQSo54ajAorOfDUAM-RPdDJgs0obqyrNSEtvbjB7hh2oK',
    //     tokenType: AssetType.FT,
    // });

    // console.log(await token.getEVMAddress());
    console.log(await  contractOpener.getConfig());
}

main();
