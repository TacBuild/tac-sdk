import { describe, expect, it, jest, beforeEach } from '@jest/globals';
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
        client = new LiteSequencerClient(endpoint);
    });

    it('should stringify bigint in request and convert response numeric strings to bigint', async () => {
        const params: ConvertCurrencyParams = {
            rawValue: 1234567890123456789n,
            currencyType: CurrencyType.TON,
        };

        const backendResponse = {
            response: {
                spotRawValue: '1234567890123456789',
                spotFriendlyValue: '1.234567890123456789',
                emaValue: '2234567890123456789',
                emaFriendlyValue: '2.234567890123456789',
                spotValueInUSD: '1.23',
                emaValueInUSD: '2.23',
                currencyType: CurrencyType.TON,
                tacPrice: { spot: '1000000000', ema: '1100000000' },
                tonPrice: { spot: '2000000000', ema: '2100000000' },
            },
        } as { response: any } as any; // shape mimics axios.data

        mockedAxios.post.mockResolvedValue({ data: backendResponse } as any);

        const result = await client.convertCurrency(params);

        expect(mockedAxios.post).toHaveBeenCalledTimes(1);
        const [url, payload] = mockedAxios.post.mock.calls[0];
        expect(url).toBe(new URL('convert_currency', endpoint).toString());
        expect(payload).toEqual({ currencyType: CurrencyType.TON, rawValue: params.rawValue.toString() });

        // Ensure numeric strings were converted to bigint
        expect(result.spotRawValue).toBe(1234567890123456789n);
        expect(result.emaValue).toBe(2234567890123456789n);
        expect(result.tacPrice.spot).toBe(1000000000n);
        expect(result.tacPrice.ema).toBe(1100000000n);
        expect(result.tonPrice.spot).toBe(2000000000n);
        expect(result.tonPrice.ema).toBe(2100000000n);
        expect(result.spotValueInUSD).toBe(1.23);
        expect(result.emaValueInUSD).toBe(2.23);

        // Ensure string fields remain strings
        expect(result.spotFriendlyValue).toBe('1.234567890123456789');
        expect(result.emaFriendlyValue).toBe('2.234567890123456789');
    });
});
