import { Network, TacSdk, liteClientOpener } from '../src';

const NETWORK = Network.Testnet;

async function main() {
    const sdk = await TacSdk.create({
        network: Network.Testnet,
        delay: 0,
        TONParams: {
            contractOpener: await liteClientOpener({ network: NETWORK }),
        }
    });

    console.log(await sdk.getEVMTokenAddress('EQCsQSo54ajAorOfDUAM-RPdDJgs0obqyrNSEtvbjB7hh2oK'));

    process.exit(); // TODO: ton-lite-client lib does not stop some of its tasks, so process does not stop by itself. [https://github.com/ton-core/ton-lite-client/issues/10]
}

main();
