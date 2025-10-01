import { TonTxFinalizer } from '../../../src/sdk/TxFinalizer';
import * as Utils from '../../../src/sdk/Utils';

const sleepSpy = jest.spyOn(Utils, 'sleep').mockResolvedValue(undefined);

describe('TonTxFinalizer', () => {
    const logger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    };

    const config = {
        urlBuilder: (hash: string) => `https://ton.example/tx/${hash}`,
        authorization: { header: 'X-Key', value: 'secret' },
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterAll(() => {
        sleepSpy.mockRestore();
    });

    it('traverses transaction tree and succeeds for healthy transactions', async () => {
        const httpClient = {
            get: jest.fn().mockResolvedValue({
                data: {
                    transactions: [
                        {
                            hash: 'hash-1',
                            inMsg: { hash: 'in', opcode: '0x12345678' },
                            description: {
                                aborted: false,
                                computePh: { success: true, exitCode: 0 },
                                action: { success: true, resultCode: 0 },
                                destroyed: false,
                            },
                            outMsgs: [{ hash: 'child-1' }],
                        },
                    ],
                },
            }),
        };

        const finalizer = new TonTxFinalizer(config, logger, httpClient as never);
        await expect(finalizer.trackTransactionTree('hash-1')).resolves.toBeUndefined();

        expect(httpClient.get).toHaveBeenCalledWith('https://ton.example/tx/hash-1', {
            headers: { 'X-Key': 'secret' },
            transformResponse: expect.any(Array),
        });
        expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Checking hash'));
    });

    it('throws when transaction execution fails', async () => {
        const httpClient = {
            get: jest.fn().mockResolvedValue({
                data: {
                    transactions: [
                        {
                            hash: 'hash-1',
                            inMsg: { hash: 'in', opcode: '0x12345678' },
                            description: {
                                aborted: true,
                                computePh: { success: false, exitCode: 32 },
                                action: { success: false, resultCode: 2 },
                                destroyed: false,
                            },
                            outMsgs: [],
                        },
                    ],
                },
            }),
        };

        const finalizer = new TonTxFinalizer(config, logger, httpClient as never);
        await expect(finalizer.trackTransactionTree('hash-1', 1)).rejects.toThrow('Transaction failed');
    });

    it('retries rate limited requests', async () => {
        const error = new Error('Request failed with status code 429');
        const httpClient = {
            get: jest
                .fn()
                .mockRejectedValueOnce(error)
                .mockResolvedValueOnce({ data: { transactions: [] } }),
        };

        const finalizer = new TonTxFinalizer(config, logger, httpClient as never);
        await finalizer.trackTransactionTree('hash-1');

        expect(httpClient.get).toHaveBeenCalledTimes(2);
        expect(sleepSpy).toHaveBeenCalled();
    });
});
