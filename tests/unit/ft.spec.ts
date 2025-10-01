import { FT, Network, Origin, TacSdk } from '../../src';

const TON_FT_ADDRESS = 'kQBLi0v_y-KiLlT1VzQJmmMbaoZnLcMAHrIEmzur13dwOti_';
const TAC_FT_ADDRESS = '0xCf61405b7525F09f4E7501fc831fE7cbCc823d4c';


describe('FT', () => {
    let sdk: TacSdk;

    beforeAll(async () => {
        sdk = await TacSdk.create({ network: Network.TESTNET });
    }, 30000);

    it('FT.getOriginAndData returns correct FTOriginAndData structure', async () => {
        const result = await FT.getOriginAndData(sdk.config, TON_FT_ADDRESS);

        expect(result).toBeDefined();
        expect(result.origin).toBeDefined();
        expect(result.origin).toBe(Origin.TON);
        expect(result.jettonMinter).toBeDefined();
        expect(result.jettonData).toBeDefined();
        expect(result.evmAddress).toBeUndefined();
    });

    it('FT.getOriginAndData returns correct FTOriginAndData structure for TAC origin', async () => {
        const tvmAddress = await FT.getTVMAddress(sdk.config, TAC_FT_ADDRESS);
        const result = await FT.getOriginAndData(sdk.config, tvmAddress);

        expect(result).toBeDefined();
        expect(result.origin).toBe(Origin.TAC);
        expect(result.jettonMinter).toBeDefined();
        expect(result.evmAddress).toBe(TAC_FT_ADDRESS);
        expect(result.jettonData).toBeUndefined(); // TAC origin should not have jettonData pre-fetched
    });
});
