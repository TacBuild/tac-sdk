import { Address, beginCell, external, storeMessage } from '@ton/ton';

import { testnet } from '../../../artifacts';
import { Configuration, ContractOpener, FormatError, IToncenterV3Indexer, Network, NoopLogger, TacSdk } from '../../../src';
import * as Utils from '../../../src/sdk/Utils';

const contractOpenerMock = {
    getTransactionByHash: jest.fn(),
} as jest.Mocked<Pick<ContractOpener, 'getTransactionByHash'>>;

const tonIndexerMock = {
    endpoint: 'https://testnet.toncenter.com/api/v3/',
    getTransactionByHash: jest.fn(),
    getAdjacentTransactions: jest.fn(),
    findCollectibleCrossChainLayerTransaction: jest.fn(),
} as unknown as jest.Mocked<IToncenterV3Indexer>;

const configMock = {
    network: Network.TESTNET,
    artifacts: testnet,
    TONParams: {
        contractOpener: contractOpenerMock,
        crossChainLayerAddress: '0:C8BA7D20AB6D96F4DD7F9574C9C4ED11A6DAC7EB6E48BAD58373052124978EB3',
    } as never,
    TACParams: {} as never,
    liteSequencerEndpoints: ['https://sequencer.tac'],
    nativeTONAddress: 'EQNative',
    nativeTACAddress: jest.fn().mockResolvedValue('0xNativeTAC'),
    getTrustedTACExecutors: ['0xExec'],
    getTrustedTONExecutors: ['EQExec'],
    closeConnections: jest.fn(),
    isContractDeployedOnTVM: jest.fn().mockResolvedValue(true),
    logger: {} as never,
};

const operationTrackerInstance = {
    simulateTACMessage: jest.fn(),
    getOperationId: jest.fn(),
    getOperationIdByTonTransactionHash: jest.fn(),
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
    sendCrossChainTransactionToTON: jest.fn().mockResolvedValue({ txHash: '0xbridge', operationId: 'op-1' }),
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

        expect(mockConfigCreate).toHaveBeenCalledWith(
            Network.TESTNET,
            testnet,
            undefined,
            undefined,
            undefined,
            5,
            new NoopLogger(),
            true,
        );
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

    it('normalizes assets before sendCrossChainTransactionToTON and delegates to TAC manager', async () => {
        const sdk = await TacSdk.create({ network: Network.TESTNET });
        const signer = { address: '0xSigner' } as never;
        const options = {
            tvmExecutorFee: 1n,
            tvmValidExecutors: ['exec'],
            waitOperationId: false,
            waitOptions: { maxAttempts: 1 },
            finalizationWaitOptions: { maxAttempts: 3 },
        };

        const result = await sdk.sendCrossChainTransactionToTON(signer, 'EQTarget', ['rawAsset'] as never, options);

        expect(normalizeAssetsSpy).toHaveBeenCalledWith(configMock, ['rawAsset']);
        expect(tacManagerInstance.sendCrossChainTransactionToTON).toHaveBeenCalledWith(
            signer,
            'EQTarget',
            ['normalized'],
            options,
        );
        expect(result).toEqual({ txHash: '0xbridge', operationId: 'op-1' });
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

    it('resolves operation id by any TON hash through indexed event traversal', async () => {
        const sdk = await TacSdk.create({
            network: Network.TESTNET,
            TONParams: {
                tonIndexer: tonIndexerMock,
            },
        });

        const inputHash = '0xa41ac40e63cb9aa683fe4702d2fc358afa896877cb21582cc841db7a6d0556b2';
        const expectedCclHash = '0xfaec7a40ea38b99b5701472f5d00e84ca6633c38b3ebee2826ff693834406352';
        const expectedOperationId = 'op-ton-123';

        tonIndexerMock.findCollectibleCrossChainLayerTransaction.mockResolvedValue({
            account: '0:C8BA7D20AB6D96F4DD7F9574C9C4ED11A6DAC7EB6E48BAD58373052124978EB3',
            hash: '+ux6QOo4uZtXAUcvXQDoTKZjPDiz6+4oJv9pODRAY1I=',
            outMsgs: [],
        });
        operationTrackerInstance.getOperationIdByTonTransactionHash.mockResolvedValue(expectedOperationId);

        const result = await sdk.getOperationIdByTonTransactionHash(inputHash, null);

        expect(result).toBe(expectedOperationId);
        expect(tonIndexerMock.findCollectibleCrossChainLayerTransaction).toHaveBeenCalledWith(
            inputHash,
            '0:C8BA7D20AB6D96F4DD7F9574C9C4ED11A6DAC7EB6E48BAD58373052124978EB3',
        );
        expect(operationTrackerInstance.getOperationIdByTonTransactionHash).toHaveBeenCalledWith(expectedCclHash, null);
    });

    it('resolves operation id by external TON message boc', async () => {
        const sdk = await TacSdk.create({ network: Network.TESTNET });
        const expectedOperationId = 'op-ton-boc-123';
        const rootTransactionHash = 'pBrEDmPLmqaD/kcC0vw1ivqJaHfLIVgsyEHbem0FVrI=';
        const ext = external({
            to: Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c'),
            body: beginCell().storeUint(1, 32).endCell(),
        });
        const boc = beginCell().store(storeMessage(ext)).endCell().toBoc().toString('base64');
        const expectedInMessageHash = Utils.getNormalizedExtMessageHash(ext);
        contractOpenerMock.getTransactionByHash.mockResolvedValue({
            hash: () => Buffer.from(rootTransactionHash, 'base64'),
        } as never);
        const operationIdByTonTransactionHashSpy = jest
            .spyOn(sdk, 'getOperationIdByTonTransactionHash')
            .mockResolvedValue(expectedOperationId as never);

        const result = await sdk.getOperationIdByTonTransactionBoc(boc, null);

        expect(result).toBe(expectedOperationId);
        const [actualAddress, actualInMessageHash] = contractOpenerMock.getTransactionByHash.mock.calls[0];
        expect(actualAddress.equals(Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c'))).toBe(true);
        expect(actualInMessageHash).toBe(expectedInMessageHash);
        expect(operationIdByTonTransactionHashSpy).toHaveBeenCalledWith(rootTransactionHash, null);
        operationIdByTonTransactionHashSpy.mockRestore();
    });

    it('throws SDK format error for invalid external TON message boc', async () => {
        const sdk = await TacSdk.create({ network: Network.TESTNET });

        await expect(sdk.getOperationIdByTonTransactionBoc('not-a-boc', null)).rejects.toMatchObject({
            name: 'FormatError',
            errorCode: 141,
        });
    });
});
