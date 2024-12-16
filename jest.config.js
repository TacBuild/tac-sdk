/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testPathIgnorePatterns: ['/node_modules/', '/dist/', '/l1_tvm_ton/'],
    moduleNameMapper: {
        '^axios$': require.resolve('axios'),
    },
};
