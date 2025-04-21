import { TacSdk } from '../../src';
import { Network, SDKParams } from '../../src';

describe('getE(T)VMTokenAddress', () => {
    jest.setTimeout(20_000);
    let tacSdk: TacSdk;

    afterAll(async () => {
        tacSdk.closeConnections();
    });

    it('should convert token address TVM->EVM and back', async () => {
        const sdkParams: SDKParams = {
            network: Network.TESTNET,
        };
        tacSdk = await TacSdk.create(sdkParams);

        const tvmTokenAddress_before = 'EQCsQSo54ajAorOfDUAM-RPdDJgs0obqyrNSEtvbjB7hh2oK'; // random
        const evmTokenAddress = await tacSdk.getEVMTokenAddress(tvmTokenAddress_before);
        const tvmTokenAddress_after = await tacSdk.getTVMTokenAddress(evmTokenAddress);

        expect(tvmTokenAddress_after).toEqual(tvmTokenAddress_before);
    });
});
