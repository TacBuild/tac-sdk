import { Address } from '@ton/ton';

import { createDefaultRetryableOpener, RetryableContractOpener } from '../../../src';
import { ContractOpener, ILogger } from '../../../src';
import { Network } from '../../../src';
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
});
