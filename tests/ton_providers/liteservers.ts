import { liteClientOpener, Network, TacSdk } from '../../src';

async function main() {
    const sdk = await TacSdk.create({
        network: Network.TESTNET,
        TONParams: {
            contractOpener: await liteClientOpener({ network: Network.TESTNET }),
        },
    });

    console.log(await sdk.getEVMTokenAddress('EQCsQSo54ajAorOfDUAM-RPdDJgs0obqyrNSEtvbjB7hh2oK'));

    sdk.closeConnections();
}

main();
