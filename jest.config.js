/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src', '<rootDir>/tests'],
    testPathIgnorePatterns: ['/node_modules/', '/dist/', '/artifacts/'],
    modulePathIgnorePatterns: ['<rootDir>/artifacts/'],
    moduleNameMapper: {
        '^axios$': require.resolve('axios'),
    },
    testMatch: ['<rootDir>/tests/**/*.test.ts', '<rootDir>/tests/**/*.spec.ts'],
    collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
};
