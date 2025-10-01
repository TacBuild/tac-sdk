import { ethers } from 'ethers';

import { mainnet,testnet } from '../../../artifacts';
import { Configuration } from '../../../src';
import { Network } from '../../../src';

describe('Configuration', () => {
    const mockSettings = {
        getAddressSetting: jest
            .fn()
            .mockResolvedValueOnce('0x1234567890123456789012345678901234567890') // CrossChainLayerAddress
            .mockResolvedValueOnce('0x9876543210987654321098765432109876543210'), // TokenUtilsAddress
        getTrustedEVMExecutors: jest.fn().mockResolvedValue(['0xabcd567890123456789012345678901234567890']),
        getTrustedTVMExecutors: jest.fn().mockResolvedValue(['EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N']),
    };

    const mockCrossChainLayer = {
        NATIVE_TOKEN_ADDRESS: {
            staticCall: jest.fn().mockResolvedValue('0xNativeToken'),
        },
    };

    const mockSmartAccountFactory = {};

    const mockProvider = {
        call: jest.fn(),
    } as never;

    const contractMock = jest.spyOn(ethers, 'Contract').mockImplementation((target: string | ethers.Addressable) => {
        if (!target) {
            return mockSettings as never; // Default fallback for undefined target
        }
        const address = typeof target === 'string' ? target : target.toString ? target.toString() : String(target);
        // Handle settings contracts (both custom test address, testnet address, and mainnet address)
        if (
            address === '0x1234567890123456789012345678901234567890' ||
            address === '0xF52a9A4C747Ce4BED079E54eB074d1C8879021D1' ||
            address === '0x1278fc68146643D7a05baAb1531618613999828D'
        ) {
            return mockSettings as never;
        } else if (address === '0x9876543210987654321098765432109876543210') {
            return mockSmartAccountFactory as never;
        } else {
            // For crossChainLayer and tokenUtils, return appropriate mocks
            return mockCrossChainLayer as never;
        }
    });

    const getDefaultProviderMock = jest.spyOn(ethers, 'getDefaultProvider').mockReturnValue(mockProvider);

    const mockTACParams = {
        provider: mockProvider,
        settingsAddress: '0x1234567890123456789012345678901234567890',
        saFactoryAddress: '0x9876543210987654321098765432109876543210',
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterAll(() => {
        contractMock.mockRestore();
        getDefaultProviderMock.mockRestore();
    });

    describe('create', () => {
        it('creates configuration for testnet network', async () => {
            const config = await Configuration.create(Network.TESTNET, testnet);

            expect(config).toBeInstanceOf(Configuration);
            expect(config.network).toBe(Network.TESTNET);
            expect(config.nativeTONAddress).toBeTruthy();
        }, 20000);

        it('creates configuration for mainnet network', async () => {
            const config = await Configuration.create(Network.MAINNET, mainnet);

            expect(config).toBeInstanceOf(Configuration);
            expect(config.network).toBe(Network.MAINNET);
            expect(config.nativeTONAddress).toBeTruthy();
        }, 20000);

        it('creates configuration with custom TON and TAC params', async () => {
            const config = await Configuration.create(Network.TESTNET, testnet, undefined, mockTACParams);

            expect(config).toBeInstanceOf(Configuration);
            expect(config.network).toBe(Network.TESTNET);
        });

        it('creates configuration with custom lite sequencer endpoints', async () => {
            const customEndpoints = ['https://custom.sequencer.tac'];
            const config = await Configuration.create(Network.TESTNET, testnet, undefined, undefined, customEndpoints);

            expect(config).toBeInstanceOf(Configuration);
            expect(config.liteSequencerEndpoints).toEqual(customEndpoints);
        });
    });

    describe('getter methods', () => {
        let config: Configuration;

        beforeEach(async () => {
            config = await Configuration.create(Network.TESTNET, testnet);
        });

        it('nativeTONAddress returns correct address', () => {
            const address = config.nativeTONAddress;
            expect(typeof address).toBe('string');
            expect(address).toBe('NONE');
        });

        it('getTrustedTACExecutors returns array', () => {
            const executors = config.getTrustedTACExecutors;
            expect(Array.isArray(executors)).toBe(true);
        });

        it('getTrustedTONExecutors returns array', () => {
            const executors = config.getTrustedTONExecutors;
            expect(Array.isArray(executors)).toBe(true);
        });

        it('closeConnections executes without error', () => {
            expect(() => config.closeConnections()).not.toThrow();
        });
    });

    describe('isContractDeployedOnTVM', () => {
        let config: Configuration;

        beforeEach(async () => {
            config = await Configuration.create(Network.TESTNET, testnet);
        });

        it('returns boolean for valid address', async () => {
            const result = await config.isContractDeployedOnTVM('EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N');
            expect(typeof result).toBe('boolean');
        });
    });
});
