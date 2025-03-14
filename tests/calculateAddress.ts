import { address } from '@ton/ton';

import { TacSdk } from '../src';
import { Network, SDKParams } from '../src';

async function main() {
    const sdkParams: SDKParams = {
        network: Network.TESTNET,
    };
    const tacSdk = await TacSdk.create(sdkParams);

    console.log(`TAC Native token: ${await tacSdk.nativeTACAddress}`);

    const tvmTokenAddress = 'EQCsQSo54ajAorOfDUAM-RPdDJgs0obqyrNSEtvbjB7hh2oK';

    // Calculate EVM Token based on TVM Token
    const evmTokenAddress = await tacSdk.getEVMTokenAddress(tvmTokenAddress);

    console.log(evmTokenAddress);

    // Calculate TVM Token based on EVM Token
    const tvmTokenAddressCalculated = await tacSdk.getTVMTokenAddress(evmTokenAddress);

    console.log(tvmTokenAddressCalculated);

    // Making sure that initial and final addresses are equal
    console.log(`Addresses equal: ${address(tvmTokenAddress).equals(address(tvmTokenAddressCalculated))}`);

    tacSdk.closeConnections();
}

main();
