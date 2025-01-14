import { Network, TacSdk } from '../src';

async function main() {
    const sdk = await TacSdk.create({
        network: Network.Testnet,
        delay: 0,
    });

    console.log(await sdk.getEVMTokenAddress('EQCsQSo54ajAorOfDUAM-RPdDJgs0obqyrNSEtvbjB7hh2oK'));

    sdk.closeConnections();
}

main();
