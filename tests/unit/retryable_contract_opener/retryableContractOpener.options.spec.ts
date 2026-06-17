import { Address } from '@ton/ton';

import { RetryableContractOpener } from '../../../src/adapters/RetryableContractOpener';
import { ContractOpener } from '../../../src/interfaces';

function createMockOpener(overrides: Partial<ContractOpener>): ContractOpener {
    return overrides as ContractOpener;
}

describe('RetryableContractOpener executeWithFallback options', () => {
    const address = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');

    it('returns null from getTransactionByHash without throwing', async () => {
        const getTransactionByHash = jest.fn().mockResolvedValue(null);
        const opener = createMockOpener({ getTransactionByHash });
        const retryable = new RetryableContractOpener([{ opener, retries: 1, retryDelay: 1 }]);

        await expect(retryable.getTransactionByHash(address, 'hash')).resolves.toBeNull();
        expect(getTransactionByHash).toHaveBeenCalledTimes(1);
    });

    it('does not fallback for non-transport errors in trackTransactionTree', async () => {
        const firstTrack = jest.fn().mockRejectedValue(new Error('validation failed'));
        const secondTrack = jest.fn().mockResolvedValue(undefined);

        const opener1 = createMockOpener({ trackTransactionTree: firstTrack });
        const opener2 = createMockOpener({ trackTransactionTree: secondTrack });
        const retryable = new RetryableContractOpener([
            { opener: opener1, retries: 3, retryDelay: 1 },
            { opener: opener2, retries: 3, retryDelay: 1 },
        ]);

        await expect(retryable.trackTransactionTree('addr', 'hash')).rejects.toThrow('validation failed');
        expect(firstTrack).toHaveBeenCalledTimes(1);
        expect(secondTrack).not.toHaveBeenCalled();
    });

    it('fallbacks for transport errors in trackTransactionTree and skips per-opener retries', async () => {
        const timeoutError = Object.assign(new Error('request timed out'), { code: 'ETIMEDOUT' });
        const firstTrack = jest.fn().mockRejectedValue(timeoutError);
        const secondTrack = jest.fn().mockResolvedValue(undefined);

        const opener1 = createMockOpener({ trackTransactionTree: firstTrack });
        const opener2 = createMockOpener({ trackTransactionTree: secondTrack });
        const retryable = new RetryableContractOpener([
            { opener: opener1, retries: 3, retryDelay: 1 },
            { opener: opener2, retries: 3, retryDelay: 1 },
        ]);

        await expect(retryable.trackTransactionTree('addr', 'hash')).resolves.toBeUndefined();
        expect(firstTrack).toHaveBeenCalledTimes(1);
        expect(secondTrack).toHaveBeenCalledTimes(1);
    });
});
