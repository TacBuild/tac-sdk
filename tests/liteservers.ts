import { Network, TacSdk, liteClientOpener } from '../src';

const NETWORK = Network.Testnet;

async function main() {
    const contractOpener = await liteClientOpener({ network: NETWORK });
    const sdk = await TacSdk.create({
        network: Network.Testnet,
        delay: 0,
        TONParams: {
            contractOpener,
        },
    });

    console.log(await sdk.getEVMTokenAddress('EQCsQSo54ajAorOfDUAM-RPdDJgs0obqyrNSEtvbjB7hh2oK'));

    contractOpener.closeConnections();
}

main();
