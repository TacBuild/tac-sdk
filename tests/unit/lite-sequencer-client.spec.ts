import { beforeEach,describe, expect, it, jest } from '@jest/globals';
import axios from 'axios';

import { LiteSequencerClient } from '../../src';
import { ConvertCurrencyParams, CurrencyType } from '../../src';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('LiteSequencerClient.convertCurrency', () => {
    const endpoint = 'https://example.com/';
    let client: LiteSequencerClient;

    beforeEach(() => {
        jest.clearAllMocks();
        // Ensure SDK's internal axios instance uses our mocked axios
        if (typeof mockedAxios.create === 'function') {
            (mockedAxios.create as jest.Mock).mockReturnValue(mockedAxios as any);
        }
        client = new LiteSequencerClient(endpoint);
    });

    it('should stringify bigint in request and convert response numeric strings to bigint', async () => {
        const params: ConvertCurrencyParams = {
            value: 1234567890123456789n,
            currency: CurrencyType.TON,
        };

        const backendResponse = {
            response: {
                spotValue: '1234567890123456789',
                emaValue: '2234567890123456789',
                decimals: 9,
                currency: CurrencyType.TON,
                tacPrice: { spot: '1000000000', ema: '1100000000' },
                tonPrice: { spot: '2000000000', ema: '2100000000' },
            },
        } as { response: any } as any; // shape mimics axios.data

        mockedAxios.post.mockResolvedValue({ data: backendResponse } as any);

        const result = await client.convertCurrency(params);

        expect(mockedAxios.post).toHaveBeenCalledTimes(1);
        const [url, payload] = mockedAxios.post.mock.calls[0];
        expect(url).toBe(new URL('convert_currency', endpoint).toString());
        expect(payload).toEqual({ currency: CurrencyType.TON, value: params.value.toString() });

        // Ensure numeric strings were converted to bigint
        expect(result.spotValue).toBe(1234567890123456789n);
        expect(result.emaValue).toBe(2234567890123456789n);
        expect(result.tacPrice.spot).toBe(1000000000n);
        expect(result.tacPrice.ema).toBe(1100000000n);
        expect(result.tonPrice.spot).toBe(2000000000n);
        expect(result.tonPrice.ema).toBe(2100000000n);

    });
});
