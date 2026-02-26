import { calculateAmount, calculateRawAmount, normalizeHashToBase64, normalizeHashToHex } from '../../src/sdk/Utils';

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

    describe('Hash normalization', () => {
        it('should normalize hex and base64url to canonical base64', async () => {
            const hex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
            const base64 = Buffer.from(hex, 'hex').toString('base64');
            const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

            expect(normalizeHashToBase64(hex)).toBe(base64);
            expect(normalizeHashToBase64(`0x${hex}`)).toBe(base64);
            expect(normalizeHashToBase64(base64url)).toBe(base64);
            expect(normalizeHashToBase64(base64)).toBe(base64);
        });

        it('should normalize base64/base64url to lower-case hex', async () => {
            const hex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
            const base64 = Buffer.from(hex, 'hex').toString('base64');
            const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

            expect(normalizeHashToHex(base64)).toBe(hex);
            expect(normalizeHashToHex(base64url)).toBe(hex);
            expect(normalizeHashToHex(`0x${hex.toUpperCase()}`)).toBe(hex);
        });
    });
});
