import { Network, TacSdk } from '../../src';
import { TonClient } from '@ton/ton';

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

    console.log(await sdk.getEVMTokenAddress('EQCsQSo54ajAorOfDUAM-RPdDJgs0obqyrNSEtvbjB7hh2oK'));
}

main();
