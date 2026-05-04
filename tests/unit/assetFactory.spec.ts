import { AssetFactory, FT, TAC, TON } from '../../src';

describe('AssetFactory.createFTAsset', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('returns TAC asset for native TAC address', async () => {
        const tonAsset = {
            getEVMAddress: jest.fn().mockResolvedValue('0xWrappedTON'),
        };
        const tacAsset = { address: 'EQNativeTACAsset' };
        const config = {
            nativeTONAddress: 'EQNativeTON',
            nativeTACAddress: jest.fn().mockResolvedValue('0xNativeTAC'),
        };

        jest.spyOn(TON, 'create').mockReturnValue(tonAsset as never);
        const tacCreateSpy = jest.spyOn(TAC, 'create').mockResolvedValue(tacAsset as never);
        const ftFromAddressSpy = jest.spyOn(FT, 'fromAddress');

        const result = await AssetFactory.createFTAsset(config as never, '0xNativeTAC');

        expect(result).toBe(tacAsset);
        expect(tacCreateSpy).toHaveBeenCalledWith(config);
        expect(ftFromAddressSpy).not.toHaveBeenCalled();
    });

    it('uses FT wrapper for non-native TAC addresses', async () => {
        const tonAsset = {
            getEVMAddress: jest.fn().mockResolvedValue('0xWrappedTON'),
        };
        const ftAsset = { address: 'EQFTAsset' };
        const config = {
            nativeTONAddress: 'EQNativeTON',
            nativeTACAddress: jest.fn().mockResolvedValue('0xNativeTAC'),
        };

        jest.spyOn(TON, 'create').mockReturnValue(tonAsset as never);
        const tacCreateSpy = jest.spyOn(TAC, 'create');
        const ftFromAddressSpy = jest.spyOn(FT, 'fromAddress').mockResolvedValue(ftAsset as never);

        const result = await AssetFactory.createFTAsset(config as never, 'EQWrappedFT');

        expect(result).toBe(ftAsset);
        expect(ftFromAddressSpy).toHaveBeenCalledWith(config, 'EQWrappedFT');
        expect(tacCreateSpy).not.toHaveBeenCalled();
    });
});
