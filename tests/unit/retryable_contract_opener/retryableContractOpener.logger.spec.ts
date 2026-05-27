import { Address } from '@ton/ton';

import { createDefaultRetryableOpener, RetryableContractOpener } from '../../../src';
import { ContractOpener, ILogger } from '../../../src';
import { Network } from '../../../src';
import { ToncenterV3Opener } from '../../../src/adapters/ToncenterV3Opener';
import * as TonClient4OpenerModule from '../../../src/adapters/TonClient4Opener';
import * as TonClientOpenerModule from '../../../src/adapters/TonClientOpener';

function createMockOpener(overrides: Partial<ContractOpener> = {}): ContractOpener {
    return {
        setLogger: jest.fn(),
        ...overrides,
    } as ContractOpener;
}

describe('createDefaultRetryableOpener logger', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('passes logger to underlying opener factories', async () => {
        const logger: ILogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        };

        const tonClientLikeOpener = createMockOpener() as unknown as TonClientOpenerModule.TonClientOpener;
        const tonClient4LikeOpener = createMockOpener() as unknown as TonClient4OpenerModule.TonClient4Opener;
        const tonClientOpenerSpy = jest
            .spyOn(TonClientOpenerModule, 'tonClientOpener')
            .mockReturnValue(tonClientLikeOpener);
        const orbsOpenerSpy = jest.spyOn(TonClientOpenerModule, 'orbsOpener').mockResolvedValue(tonClientLikeOpener);
        const orbsOpener4Spy = jest
            .spyOn(TonClient4OpenerModule, 'orbsOpener4')
            .mockResolvedValue(tonClient4LikeOpener);

        const retryableOpener = await createDefaultRetryableOpener(
            'https://example.com',
            Network.TESTNET,
            1,
            1,
            logger,
        );

        expect(retryableOpener).toBeInstanceOf(RetryableContractOpener);
        expect(tonClientOpenerSpy).toHaveBeenCalledWith(expect.anything(), logger);
        expect(orbsOpenerSpy).toHaveBeenCalledWith(Network.TESTNET, logger);
        expect(orbsOpener4Spy).toHaveBeenCalledWith(Network.TESTNET, expect.any(Number), logger);
    });

    it('uses Toncenter v3 opener first when v3 endpoint is configured', async () => {
        const tonClientLikeOpener = createMockOpener({
            trackTransactionTreeWithResult: jest.fn().mockResolvedValue({ success: true, checkedCount: 2 }),
        }) as unknown as TonClientOpenerModule.TonClientOpener;
        jest.spyOn(TonClientOpenerModule, 'tonClientOpener').mockReturnValue(tonClientLikeOpener);
        jest.spyOn(TonClientOpenerModule, 'orbsOpener').mockResolvedValue(tonClientLikeOpener);
        jest.spyOn(TonClient4OpenerModule, 'orbsOpener4').mockRejectedValue(new Error('skip'));

        const v3TrackSpy = jest
            .spyOn(ToncenterV3Opener.prototype, 'trackTransactionTreeWithResult')
            .mockResolvedValue({ success: true, checkedCount: 1 });

        const retryableOpener = await createDefaultRetryableOpener(
            'https://example.com',
            Network.TESTNET,
            0,
            1,
            undefined,
            'https://example.com/api/v3/',
        );

        const result = await retryableOpener.trackTransactionTreeWithResult(
            'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
            'hash',
        );

        expect(result).toEqual({ success: true, checkedCount: 1 });
        expect(v3TrackSpy).toHaveBeenCalledTimes(1);
        expect(tonClientLikeOpener.trackTransactionTreeWithResult).not.toHaveBeenCalled();
    });

    it('writes a single failure log for contract execution errors', async () => {
        const logger: ILogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        };
        const address = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');
        const executionError = new Error('Unable to execute get method. Got exit_code: 11');

        const opener1 = createMockOpener({
            setLogger: jest.fn(),
            getContractState: jest.fn().mockRejectedValue(executionError),
        });
        const opener2 = createMockOpener({
            setLogger: jest.fn(),
            getContractState: jest.fn(),
        });
        const retryable = new RetryableContractOpener([
            { opener: opener1, retries: 0, retryDelay: 1 },
            { opener: opener2, retries: 0, retryDelay: 1 },
        ], logger);

        await expect(retryable.getContractState(address)).rejects.toThrow(executionError.message);
        expect(opener2.getContractState).not.toHaveBeenCalled();

        const debugCalls = (logger.debug as jest.Mock).mock.calls.map((call) => String(call[0]));
        expect(debugCalls.some((line) => line.includes('stopping fallback because of contract execution error'))).toBe(
            true,
        );
        expect(debugCalls.filter((line) => line.includes('stopping fallback because of contract execution error'))).toHaveLength(
            1,
        );
    });

    it('falls back on Toncenter HTTP 542 while tracking a transaction tree', async () => {
        const providerError = Object.assign(new Error('Request failed with status code 542'), {
            response: { status: 542 },
        });
        const opener1 = createMockOpener({
            trackTransactionTreeWithResult: jest.fn().mockRejectedValue(providerError),
        });
        const opener2 = createMockOpener({
            trackTransactionTreeWithResult: jest.fn().mockResolvedValue({ success: true, checkedCount: 1 }),
        });
        const retryable = new RetryableContractOpener([
            { opener: opener1, retries: 0, retryDelay: 1 },
            { opener: opener2, retries: 0, retryDelay: 1 },
        ]);

        const result = await retryable.trackTransactionTreeWithResult(
            'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
            'hash',
        );

        expect(result).toEqual({ success: true, checkedCount: 1 });
        expect(opener1.trackTransactionTreeWithResult).toHaveBeenCalledTimes(1);
        expect(opener2.trackTransactionTreeWithResult).toHaveBeenCalledTimes(1);
    });
});
