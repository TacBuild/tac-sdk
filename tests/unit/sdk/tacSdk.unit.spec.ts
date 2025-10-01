import { testnet } from '../../../artifacts';
import { Configuration, Network, TacSdk } from '../../../src';
import * as Utils from '../../../src/sdk/Utils';

const configMock = {
    network: Network.TESTNET,
    artifacts: testnet,
    TONParams: {} as never,
    TACParams: {} as never,
    liteSequencerEndpoints: ['https://sequencer.tac'],
    nativeTONAddress: 'EQNative',
    nativeTACAddress: jest.fn().mockResolvedValue('0xNativeTAC'),
    getTrustedTACExecutors: ['0xExec'],
    getTrustedTONExecutors: ['EQExec'],
    closeConnections: jest.fn(),
    isContractDeployedOnTVM: jest.fn().mockResolvedValue(true),
};

const operationTrackerInstance = {
    simulateTACMessage: jest.fn(),
    getOperationId: jest.fn(),
    getStageProfiling: jest.fn(),
};

const simulatorInstance = {
    getSimulationsInfo: jest.fn(),
};

const tonManagerInstance = {
    sendCrossChainTransaction: jest.fn(),
    sendCrossChainTransactions: jest.fn(),
};

const tacManagerInstance = {
    bridgeTokensToTON: jest.fn().mockResolvedValue('0xbridge'),
};

jest.mock('../../../src/sdk/Configuration', () => ({
    Configuration: {
        create: jest.fn(),
    },
}));

jest.mock('../../../src/sdk/OperationTracker', () => ({
    OperationTracker: jest.fn(() => operationTrackerInstance),
}));

jest.mock('../../../src/sdk/Simulator', () => ({
    Simulator: jest.fn(() => simulatorInstance),
}));

jest.mock('../../../src/sdk/TONTransactionManager', () => ({
    TONTransactionManager: jest.fn(() => tonManagerInstance),
}));

jest.mock('../../../src/sdk/TACTransactionManager', () => ({
    TACTransactionManager: jest.fn(() => tacManagerInstance),
}));

const mockConfigCreate = Configuration.create as jest.MockedFunction<typeof Configuration.create>;

describe('TacSdk factory and delegation', () => {
    const normalizeAssetsSpy = jest.spyOn(Utils, 'normalizeAssets').mockResolvedValue(['normalized'] as never);

    beforeEach(() => {
        jest.clearAllMocks();
        mockConfigCreate.mockResolvedValue(configMock);
    });

    afterAll(() => {
        normalizeAssetsSpy.mockRestore();
    });

    it('creates SDK with correct configuration for selected network', async () => {
        const sdk = await TacSdk.create({ network: Network.TESTNET, delay: 5 });

        expect(mockConfigCreate).toHaveBeenCalledWith(Network.TESTNET, testnet, undefined, undefined, undefined, 5);
        expect(sdk.nativeTONAddress).toBe('EQNative');
    });

    it('normalizes assets before bridging and delegates to TAC manager', async () => {
        const sdk = await TacSdk.create({ network: Network.TESTNET });
        const signer = { address: '0xSigner' } as never;

        const result = await sdk.bridgeTokensToTON(signer, 10n, 'EQTarget', ['rawAsset'] as never, 1n, ['exec']);

        expect(normalizeAssetsSpy).toHaveBeenCalledWith(configMock, ['rawAsset']);
        expect(tacManagerInstance.bridgeTokensToTON).toHaveBeenCalledWith(signer, 10n, 'EQTarget', ['normalized'], 1n, [
            'exec',
        ]);
        expect(result).toBe('0xbridge');
    });

    it('normalizes assets before sending a cross-chain transaction batch', async () => {
        const sdk = await TacSdk.create({ network: Network.TESTNET });
        normalizeAssetsSpy.mockResolvedValueOnce(['n1'] as never).mockResolvedValueOnce(['n2'] as never);

        await sdk.sendCrossChainTransactions({ kind: 'sender' } as never, [
            { evmProxyMsg: { target: 'a' } } as never,
            { evmProxyMsg: { target: 'b' } } as never,
        ]);

        expect(normalizeAssetsSpy).toHaveBeenCalledTimes(2);
        expect(tonManagerInstance.sendCrossChainTransactions).toHaveBeenCalledWith(
            { kind: 'sender' },
            [
                { evmProxyMsg: { target: 'a' }, options: undefined, assets: ['n1'] },
                { evmProxyMsg: { target: 'b' }, options: undefined, assets: ['n2'] },
            ],
            undefined,
        );
    });
});
