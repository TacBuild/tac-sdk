import { address } from '@ton/ton';
import { NFTAddressType, TacSdk } from '../../src';
import { SDKParams } from '../../src';
import { localSDKParams } from '../utils';

const EVM_SETTINGS_ADDRESS = '';
const TVM_SETTINGS_ADDRESS = '';

describe('getE(T)VMTokenAddress', () => {
    jest.setTimeout(20_000);
    let tacSdk: TacSdk;

    afterAll(async () => {
        tacSdk.closeConnections();
    });

    beforeAll(async () => {
        const sdkParams: SDKParams = localSDKParams(EVM_SETTINGS_ADDRESS, TVM_SETTINGS_ADDRESS);
        tacSdk = await TacSdk.create(sdkParams);
    });

    it('should convert token address TVM->EVM and back', async () => {
        const tvmTokenAddress_before = 'EQCsQSo54ajAorOfDUAM-RPdDJgs0obqyrNSEtvbjB7hh2oK'; // random
        const evmTokenAddress = await tacSdk.getEVMTokenAddress(tvmTokenAddress_before);
        const tvmTokenAddress_after = await tacSdk.getTVMTokenAddress(evmTokenAddress);

        expect(tvmTokenAddress_after).toEqual(tvmTokenAddress_before);
    });

    it('should convert nft address and back', async () => {
        const collectionAddress_before = 'kQBMBF7yiAE5Ucmm0HpSatfboibwPcu_gG_zK0rDhmBhcxCD';
        const evmAddress = await tacSdk.getEVMNFTAddress(collectionAddress_before, NFTAddressType.COLLECTION);
        console.log(`EVM address ${evmAddress}`);
        const collectionAddress_after = await tacSdk.getTVMNFTAddress(evmAddress);
        console.log(`TVM address before: ${collectionAddress_before}, after: ${collectionAddress_after}`);

        expect(address(collectionAddress_before).equals(address(collectionAddress_after))).toBeTruthy();
    });
});
