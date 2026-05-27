/* global module, process, require */

/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
const runTonProviderTests = process.env.RUN_TON_PROVIDER_TESTS === '1';

module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src', '<rootDir>/tests'],
    testPathIgnorePatterns: [
        '/node_modules/',
        '/dist/',
        '/artifacts/',
        ...(runTonProviderTests ? [] : ['/tests/ton_providers/']),
    ],
    modulePathIgnorePatterns: ['<rootDir>/artifacts/'],
    moduleNameMapper: {
        '^axios$': require.resolve('axios'),
    },
    testMatch: ['<rootDir>/tests/**/*.test.ts', '<rootDir>/tests/**/*.spec.ts'],
    collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
};
