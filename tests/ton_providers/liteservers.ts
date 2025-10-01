import { AssetType, CurrencyType, liteClientOpener, Network, TacSdk } from '../../src';

async function main() {
    const sdk = await TacSdk.create({
        network: Network.TESTNET,
        TONParams: {
            contractOpener: await liteClientOpener({ network: Network.TESTNET }),
        },
    });
    const tokenAddress = 'EQCsQSo54ajAorOfDUAM-RPdDJgs0obqyrNSEtvbjB7hh2oK';
    const token1 = await sdk.getFT(tokenAddress);
    const token2 = await sdk.getAsset({
        address: tokenAddress,
        tokenType: AssetType.FT,
    });

    console.log(await token1.getJettonData());
    console.log(await token2.getJettonData());
    console.log(await token2.getEVMAddress());

    const a = await sdk.operationTracker.convertCurrency({
        value: 0n,
        currency: CurrencyType.TON,
    });

    console.log(a);

    sdk.closeConnections();
}

main();
