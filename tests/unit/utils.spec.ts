import { calculateAmount, calculateRawAmount } from '../../src/sdk/Utils';

describe('Utils', () => {
    describe('Token values', () => {
        it.each([
            { amount: 0.1234, decimals: 18, expected: 1234n * 10n ** 14n },
            { amount: 1234, decimals: 18, expected: 1234n * 10n ** 18n },
        ])('should convert to raw format', async ({ amount, decimals, expected }) => {
            expect(calculateRawAmount(amount, decimals)).toBe(expected);
        });

        it.each([
            { rawAmount: 1234n * 10n ** 18n, decimals: 18, expected: 1234 },
            { rawAmount: 1234n, decimals: 8, expected: 0.00001234 },
        ])('should convert to raw format', async ({ rawAmount, decimals, expected }) => {
            expect(calculateAmount(rawAmount, decimals)).toBe(expected);
        });
    });
});
