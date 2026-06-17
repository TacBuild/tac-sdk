import { ethers } from 'ethers';

import type { Asset } from '../../../src';
import {
    AssetFactory,
    AssetType,
    BlockchainType,
    ExecutionStages,
    OperationType,
    Origin,
    TACTransactionManager,
} from '../../../src';
import * as Utils from '../../../src/sdk/Utils';
import { Validator } from '../../../src/sdk/Validator';

const tvmValidatorSpy = jest.spyOn(Validator, 'validateTVMAddress').mockImplementation(() => undefined);

const tonAssetsStub = [{ amount: '5', tokenAddress: '0xToken', assetType: AssetType.FT } as never];
const mapAssetsToTonAssetsSpy = jest.spyOn(Utils, 'mapAssetsToTonAssets').mockReturnValue(tonAssetsStub);

const assetFactorySpy = jest.spyOn(AssetFactory, 'from');

describe('TACTransactionManager', () => {
    let stageProfilingResult: ExecutionStages;

    const operationTracker = {
        getTVMExecutorFee: jest.fn().mockResolvedValue({ inTAC: '33', inTON: '0' }),
        getOperationIdByTransactionHash: jest.fn(),
        getOperationType: jest.fn(),
        getStageProfiling: jest.fn(),
    };

    const contractOpener = {
        trackTransactionTree: jest.fn(),
    };

    const crossChainLayerSend = Object.assign(
        jest.fn().mockReturnValue({
            wait: jest.fn().mockResolvedValue(undefined),
            hash: '0xhash',
        }),
        {
            estimateGas: jest.fn().mockResolvedValue(30n),
        },
    );

    const provider = {
        getFeeData: jest.fn().mockResolvedValue({ gasPrice: 1n, maxFeePerGas: 1n, maxPriorityFeePerGas: 0n }),
        getBalance: jest.fn().mockResolvedValue(1000n),
        getBlock: jest.fn().mockResolvedValue({ gasLimit: 90_000_000n }),
    };

    const crossChainLayer = {
        getAddress: jest.fn().mockResolvedValue('0xCrossChainLayer'),
        getProtocolFee: jest.fn().mockResolvedValue(5n),
        connect: jest.fn().mockReturnValue({ sendMessage: crossChainLayerSend }),
    };

    const config = {
        TACParams: {
            crossChainLayer,
            provider,
        },
        TONParams: {
            contractOpener,
            crossChainLayerAddress: 'EQCrossChainLayer',
        },
        artifacts: {
            tac: {
                compilationArtifacts: {
                    IERC20WithDecimals: { abi: [] },
                    IERC721: { abi: [] },
                },
                utils: {
                    encodeOutMessageV1: jest.fn().mockReturnValue('encoded'),
                },
            },
        },
        getTrustedTONExecutors: ['ton-exec'],
        nativeTACAddress: jest.fn().mockResolvedValue('0xNativeTAC'),
    };

    const signer = { address: '0xSigner' } as ethers.Wallet;

    const erc20Approve = Object.assign(jest.fn().mockResolvedValue({ wait: jest.fn().mockResolvedValue(undefined) }), {
        estimateGas: jest.fn().mockResolvedValue(10n),
    });
    const erc721Approve = Object.assign(jest.fn().mockResolvedValue({ wait: jest.fn().mockResolvedValue(undefined) }), {
        estimateGas: jest.fn().mockResolvedValue(20n),
    });

    const erc20Contract = { connect: jest.fn().mockReturnValue({ approve: erc20Approve }) };
    const erc721Contract = { connect: jest.fn().mockReturnValue({ approve: erc721Approve }) };

    const contractMock = jest
        .spyOn(ethers, 'Contract')
        .mockImplementation((target: string | ethers.Addressable) => {
            const address =
                typeof target === 'string'
                    ? target
                    : 'address' in target
                      ? String(target.address)
                      : target.toString();
            return (address === '0xFT' ? erc20Contract : erc721Contract) as never;
        });

    const logger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        operationTracker.getTVMExecutorFee.mockResolvedValue({ inTAC: '33', inTON: '0' });
        operationTracker.getOperationIdByTransactionHash.mockResolvedValue('op-bridge');
        operationTracker.getOperationType.mockResolvedValue(OperationType.TAC_TON);
        crossChainLayer.getProtocolFee.mockResolvedValue(5n);
        erc20Approve.mockResolvedValue({ wait: jest.fn().mockResolvedValue(undefined) });
        erc721Approve.mockResolvedValue({ wait: jest.fn().mockResolvedValue(undefined) });
        stageProfilingResult = {
            operationType: OperationType.TAC_TON,
            metaInfo: {},
            executedInTON: {
                exists: false,
                stageData: null,
            },
        } as never;
        operationTracker.getStageProfiling.mockImplementation(
            async (
                _operationId: string,
                waitOptions?: { onSuccess?: (profilingData: ExecutionStages) => Promise<void> | void },
            ) => {
                await waitOptions?.onSuccess?.(stageProfilingResult);
                return stageProfilingResult;
            },
        );
        crossChainLayerSend.mockReturnValue({ wait: jest.fn().mockResolvedValue(undefined), hash: '0xhash' });
        crossChainLayerSend.estimateGas.mockResolvedValue(30n);
        erc20Approve.estimateGas.mockResolvedValue(10n);
        erc721Approve.estimateGas.mockResolvedValue(20n);
        provider.getFeeData.mockResolvedValue({ gasPrice: 1n, maxFeePerGas: 1n, maxPriorityFeePerGas: 0n });
        provider.getBalance.mockResolvedValue(1000n);
        provider.getBlock.mockResolvedValue({ gasLimit: 90_000_000n });
        assetFactorySpy.mockResolvedValue({
            address: 'EQNativeTACAsset',
            type: AssetType.FT,
            origin: Origin.TAC,
            rawAmount: 0n,
            withRawAmount: (amount: bigint) =>
                ({
                    address: 'EQNativeTACAsset',
                    type: AssetType.FT,
                    origin: Origin.TAC,
                    rawAmount: amount,
                    getEVMAddress: async () => '0xNativeTAC',
                }) as unknown as Asset,
        } as unknown as Asset);
    });

    afterAll(() => {
        contractMock.mockRestore();
        assetFactorySpy.mockRestore();
        mapAssetsToTonAssetsSpy.mockRestore();
        tvmValidatorSpy.mockRestore();
    });

    it('approves assets, fetches executor fee and sends bridge transaction', async () => {
        const manager = new TACTransactionManager(config as never, operationTracker as never, logger as never);

        const ftAsset = {
            address: 'EQFTAsset',
            type: AssetType.FT,
            origin: Origin.TAC,
            rawAmount: 10n,
            getEVMAddress: jest.fn().mockResolvedValue('0xFT'),
            checkCanBeTransferredBy: jest.fn().mockResolvedValue(undefined),
        } as unknown as Asset;

        const nftAsset = {
            address: 'EQNFTAsset',
            type: AssetType.NFT,
            origin: Origin.TAC,
            rawAmount: 1n,
            getEVMAddress: jest.fn().mockResolvedValue('0xNFT'),
            checkCanBeTransferredBy: jest.fn().mockResolvedValue(undefined),
            addresses: { index: 7n },
        } as unknown as Asset;

        const result = await manager.bridgeTokensToTON(
            signer,
            25n,
            'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N',
            [ftAsset, nftAsset] as never,
        );

        expect(result).toBe('0xhash');
        expect(tvmValidatorSpy).toHaveBeenCalled();
        expect(erc20Approve).toHaveBeenCalledWith('0xCrossChainLayer', 10n);
        expect(erc721Approve).toHaveBeenCalledWith('0xCrossChainLayer', 7n);
        expect(operationTracker.getTVMExecutorFee).toHaveBeenCalledWith(
            {
                feeSymbol: 'TAC',
                tonAssets: tonAssetsStub,
                tvmValidExecutors: ['ton-exec'],
            },
            null,
        );
        expect(config.artifacts.tac.utils.encodeOutMessageV1).toHaveBeenCalledWith(
            expect.objectContaining({
                tvmValidExecutors: ['ton-exec'],
            }),
        );
        expect(provider.getFeeData).not.toHaveBeenCalled();
        expect(provider.getBalance).not.toHaveBeenCalled();
        expect(crossChainLayerSend).toHaveBeenCalledWith(1n, 'encoded', { value: 63n });
    });

    it('uses custom executors in direct bridge call', async () => {
        const manager = new TACTransactionManager(config as never, operationTracker as never, logger as never);
        const customExecutors = ['EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N'];

        await manager.bridgeTokensToTON(
            signer,
            25n,
            'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N',
            [],
            undefined,
            customExecutors,
        );

        expect(operationTracker.getTVMExecutorFee).toHaveBeenCalledWith(
            {
                feeSymbol: 'TAC',
                tonAssets: tonAssetsStub,
                tvmValidExecutors: customExecutors,
            },
            null,
        );
        expect(config.artifacts.tac.utils.encodeOutMessageV1).toHaveBeenCalledWith(
            expect.objectContaining({
                tvmValidExecutors: customExecutors,
            }),
        );
    });

    it('throws early in sendCrossChainTransactionToTON when signer does not have enough TAC for value and gas', async () => {
        const manager = new TACTransactionManager(config as never, operationTracker as never, logger as never);
        const nativeTacAsset = {
            address: 'EQNativeTACAsset',
            type: AssetType.FT,
            origin: Origin.TAC,
            rawAmount: 25n,
        } as unknown as Asset;

        provider.getBalance.mockResolvedValue(62n);

        await expect(
            manager.sendCrossChainTransactionToTON(
                signer,
                'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N',
                [nativeTacAsset] as never,
                {
                    waitOperationId: false,
                    waitFinalization: false,
                },
            ),
        ).rejects.toThrow('Insufficient balance of TAC');

        expect(erc20Approve).not.toHaveBeenCalled();
        expect(crossChainLayerSend).not.toHaveBeenCalled();
    });

    it('throws before approvals when signer does not have enough TAC for approval gas', async () => {
        const manager = new TACTransactionManager(config as never, operationTracker as never, logger as never);
        const wrappedFtAsset = {
            address: 'EQWrappedTACAsset',
            type: AssetType.FT,
            origin: Origin.TON,
            rawAmount: 10n,
            getEVMAddress: jest.fn().mockResolvedValue('0xFT'),
            checkCanBeTransferredBy: jest.fn().mockResolvedValue(undefined),
        } as unknown as Asset;

        provider.getBalance.mockResolvedValue(9n);

        await expect(
            manager.sendCrossChainTransactionToTON(
                signer,
                'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N',
                [wrappedFtAsset] as never,
                {
                    waitOperationId: false,
                    waitFinalization: false,
                },
            ),
        ).rejects.toThrow('Insufficient balance of TAC');

        expect(erc20Approve).not.toHaveBeenCalled();
        expect(crossChainLayerSend.estimateGas).not.toHaveBeenCalled();
        expect(crossChainLayerSend).not.toHaveBeenCalled();
    });

    it('supports operation tracking and finalization via sendCrossChainTransactionToTON', async () => {
        const manager = new TACTransactionManager(config as never, operationTracker as never, logger as never);
        const nativeTacAsset = {
            address: 'EQNativeTACAsset',
            type: AssetType.FT,
            origin: Origin.TAC,
            rawAmount: 25n,
        } as unknown as Asset;
        const wrappedFtAsset = {
            address: 'EQWrappedTACAsset',
            type: AssetType.FT,
            origin: Origin.TON,
            rawAmount: 10n,
            getEVMAddress: jest.fn().mockResolvedValue('0xFT'),
            checkCanBeTransferredBy: jest.fn().mockResolvedValue(undefined),
        } as unknown as Asset;

        stageProfilingResult = {
            operationType: OperationType.TAC_TON,
            metaInfo: {},
            executedInTON: {
                exists: true,
                stageData: {
                    success: true,
                    timestamp: 1,
                    transactions: [{ hash: 'tx-1', blockchainType: 'TON' }],
                    note: null,
                },
            },
        } as never;

        const result = await manager.sendCrossChainTransactionToTON(
            signer,
            'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N',
            [nativeTacAsset, wrappedFtAsset] as never,
            {
                waitOperationIdOptions: { maxAttempts: 1, delay: 5 },
                finalizationWaitOptions: {
                    maxAttempts: 2,
                    delay: 10,
                },
            },
        );

        expect(result).toEqual({ txHash: '0xhash', operationId: 'op-bridge' });
        expect(erc20Approve).toHaveBeenCalledWith(
            '0xCrossChainLayer',
            10n,
            expect.objectContaining({ maxFeePerGas: 1n, maxPriorityFeePerGas: 0n, gasLimit: 10n }),
        );
        expect(erc20Approve.mock.invocationCallOrder[0]).toBeLessThan(
            crossChainLayerSend.estimateGas.mock.invocationCallOrder[0],
        );
        expect(wrappedFtAsset.checkCanBeTransferredBy).toHaveBeenCalledWith('0xSigner', BlockchainType.TAC);
        expect(operationTracker.getOperationIdByTransactionHash).toHaveBeenCalledWith(
            '0xhash',
            expect.objectContaining({ logger, maxAttempts: 1, delay: 5 }),
        );
        expect(operationTracker.getOperationType).not.toHaveBeenCalled();
        expect(operationTracker.getStageProfiling).toHaveBeenCalledWith(
            'op-bridge',
            expect.objectContaining({
                logger,
                maxAttempts: 2,
                delay: 10,
                successCheck: expect.any(Function),
            }),
        );
        expect(contractOpener.trackTransactionTree).toHaveBeenCalledWith('EQCrossChainLayer', 'tx-1');
        expect(crossChainLayerSend).toHaveBeenCalledWith(
            1n,
            'encoded',
            expect.objectContaining({ value: 63n, maxFeePerGas: 1n, maxPriorityFeePerGas: 0n, gasLimit: 30n }),
        );
    });

    it('estimates sendMessage only after approvals and re-checks TAC balance afterwards', async () => {
        const manager = new TACTransactionManager(config as never, operationTracker as never, logger as never);
        const wrappedFtAsset = {
            address: 'EQWrappedTACAsset',
            type: AssetType.FT,
            origin: Origin.TON,
            rawAmount: 10n,
            getEVMAddress: jest.fn().mockResolvedValue('0xFT'),
            checkCanBeTransferredBy: jest.fn().mockResolvedValue(undefined),
        } as unknown as Asset;

        let approvalCompleted = false;
        erc20Approve.mockImplementation(async () => {
            approvalCompleted = true;
            return { wait: jest.fn().mockResolvedValue(undefined) };
        });
        crossChainLayerSend.estimateGas.mockImplementation(async () => {
            if (!approvalCompleted) {
                throw new Error('sendMessage estimated before approvals');
            }

            return 30n;
        });
        provider.getBalance.mockResolvedValueOnce(10n).mockResolvedValueOnce(67n);

        await expect(
            manager.sendCrossChainTransactionToTON(
                signer,
                'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N',
                [wrappedFtAsset] as never,
                {
                    waitOperationId: false,
                    waitFinalization: false,
                },
            ),
        ).rejects.toThrow('Insufficient balance of TAC');

        expect(erc20Approve).toHaveBeenCalledWith(
            '0xCrossChainLayer',
            10n,
            expect.objectContaining({ maxFeePerGas: 1n, maxPriorityFeePerGas: 0n, gasLimit: 10n }),
        );
        expect(crossChainLayerSend.estimateGas).toHaveBeenCalledWith(
            1n,
            'encoded',
            expect.objectContaining({ value: 38n, maxFeePerGas: 1n, maxPriorityFeePerGas: 0n }),
        );
        expect(crossChainLayerSend).not.toHaveBeenCalled();
    });

    it('treats only TAC-origin native FT asset as value in sendCrossChainTransactionToTON', async () => {
        const manager = new TACTransactionManager(config as never, operationTracker as never, logger as never);
        const nativeTacAsset = {
            address: 'EQNativeTACAsset',
            type: AssetType.FT,
            origin: Origin.TAC,
            rawAmount: 25n,
        } as unknown as Asset;
        const tonOriginAssetWithSameAddress = {
            address: 'EQNativeTACAsset',
            type: AssetType.FT,
            origin: Origin.TON,
            rawAmount: 9n,
            getEVMAddress: jest.fn().mockResolvedValue('0xFT'),
            checkCanBeTransferredBy: jest.fn().mockResolvedValue(undefined),
        } as unknown as Asset;

        await manager.sendCrossChainTransactionToTON(
            signer,
            'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N',
            [nativeTacAsset, tonOriginAssetWithSameAddress] as never,
            {
                waitOperationId: false,
                waitFinalization: false,
            },
        );

        expect(erc20Approve).toHaveBeenCalledWith(
            '0xCrossChainLayer',
            9n,
            expect.objectContaining({ maxFeePerGas: 1n, maxPriorityFeePerGas: 0n, gasLimit: 10n }),
        );
        expect(crossChainLayerSend).toHaveBeenCalledWith(
            1n,
            'encoded',
            expect.objectContaining({ value: 63n, maxFeePerGas: 1n, maxPriorityFeePerGas: 0n, gasLimit: 30n }),
        );
        expect(operationTracker.getOperationIdByTransactionHash).not.toHaveBeenCalled();
    });

    it('throws early when estimated TAC gas exceeds the latest block gas limit', async () => {
        const manager = new TACTransactionManager(config as never, operationTracker as never, logger as never);
        const wrappedFtAsset = {
            address: 'EQWrappedTACAsset',
            type: AssetType.FT,
            origin: Origin.TON,
            rawAmount: 10n,
            getEVMAddress: jest.fn().mockResolvedValue('0xFT'),
            checkCanBeTransferredBy: jest.fn().mockResolvedValue(undefined),
        } as unknown as Asset;

        provider.getBlock.mockResolvedValue({ gasLimit: 9n });

        await expect(
            manager.sendCrossChainTransactionToTON(
                signer,
                'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N',
                [wrappedFtAsset] as never,
                {
                    waitOperationId: false,
                    waitFinalization: false,
                },
            ),
        ).rejects.toThrow('Estimated gas for approve (10) exceeds current TAC block gas limit (9)');

        expect(erc20Approve).not.toHaveBeenCalled();
        expect(crossChainLayerSend).not.toHaveBeenCalled();
    });

    it('validates non-native TAC FT balance by default in sendCrossChainTransactionToTON', async () => {
        const manager = new TACTransactionManager(config as never, operationTracker as never, logger as never);
        const wrappedFtAsset = {
            address: 'EQWrappedTACAsset',
            type: AssetType.FT,
            origin: Origin.TON,
            rawAmount: 10n,
            getEVMAddress: jest.fn().mockResolvedValue('0xFT'),
            checkCanBeTransferredBy: jest.fn().mockResolvedValue(undefined),
        } as unknown as Asset;

        wrappedFtAsset.checkCanBeTransferredBy = jest.fn().mockRejectedValue(new Error('Insufficient balance of EQWrappedTACAsset'));

        await expect(
            manager.sendCrossChainTransactionToTON(
                signer,
                'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N',
                [wrappedFtAsset] as never,
                {
                    waitOperationId: false,
                    waitFinalization: false,
                },
            ),
        ).rejects.toThrow('Insufficient balance of EQWrappedTACAsset');

        expect(wrappedFtAsset.checkCanBeTransferredBy).toHaveBeenCalledWith('0xSigner', BlockchainType.TAC);
        expect(erc20Approve).not.toHaveBeenCalled();
        expect(crossChainLayerSend).not.toHaveBeenCalled();
    });

    it('skips non-native TAC asset balance validation when validateAssetsBalance is false', async () => {
        const manager = new TACTransactionManager(config as never, operationTracker as never, logger as never);
        const wrappedFtAsset = {
            address: 'EQWrappedTACAsset',
            type: AssetType.FT,
            origin: Origin.TON,
            rawAmount: 10n,
            getEVMAddress: jest.fn().mockResolvedValue('0xFT'),
            checkCanBeTransferredBy: jest.fn().mockRejectedValue(new Error('Insufficient balance of EQWrappedTACAsset')),
        } as unknown as Asset;

        const result = await manager.sendCrossChainTransactionToTON(
            signer,
            'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N',
            [wrappedFtAsset] as never,
            {
                validateAssetsBalance: false,
                waitOperationId: false,
                waitFinalization: false,
            },
        );

        expect(result).toEqual({ txHash: '0xhash' });
        expect(erc20Approve).toHaveBeenCalledWith(
            '0xCrossChainLayer',
            10n,
            expect.objectContaining({ maxFeePerGas: 1n, maxPriorityFeePerGas: 0n, gasLimit: 10n }),
        );
        expect(wrappedFtAsset.checkCanBeTransferredBy).not.toHaveBeenCalled();
        expect(crossChainLayerSend).toHaveBeenCalledWith(
            1n,
            'encoded',
            expect.objectContaining({ value: 38n, maxFeePerGas: 1n, maxPriorityFeePerGas: 0n, gasLimit: 30n }),
        );
    });

    it('throws when TAC provider does not return maxFeePerGas', async () => {
        const manager = new TACTransactionManager(config as never, operationTracker as never, logger as never);

        provider.getFeeData.mockResolvedValue({ gasPrice: 1n, maxFeePerGas: null, maxPriorityFeePerGas: null });

        await expect(
            manager.sendCrossChainTransactionToTON(
                signer,
                'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N',
                [],
                {
                    waitOperationId: false,
                    waitFinalization: false,
                },
            ),
        ).rejects.toThrow('Failed to fetch gas price: TAC provider did not return maxFeePerGas');

        expect(crossChainLayerSend).not.toHaveBeenCalled();
    });

    it('skips full finalization when waitFinalization is false but still resolves operation id by default', async () => {
        const manager = new TACTransactionManager(config as never, operationTracker as never, logger as never);

        await manager.sendCrossChainTransactionToTON(
            signer,
            'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N',
            [],
            {
                waitFinalization: false,
            },
        );

        expect(operationTracker.getOperationIdByTransactionHash).toHaveBeenCalledWith(
            '0xhash',
            expect.objectContaining({ logger }),
        );
        expect(operationTracker.getOperationType).not.toHaveBeenCalled();
        expect(operationTracker.getStageProfiling).not.toHaveBeenCalled();
        expect(contractOpener.trackTransactionTree).not.toHaveBeenCalled();
    });

    it('skips operation id resolution when waitOperationId and waitFinalization are false', async () => {
        const manager = new TACTransactionManager(config as never, operationTracker as never, logger as never);

        await manager.sendCrossChainTransactionToTON(
            signer,
            'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N',
            [],
            {
                waitOperationId: false,
                waitFinalization: false,
            },
        );

        expect(operationTracker.getOperationIdByTransactionHash).not.toHaveBeenCalled();
        expect(operationTracker.getOperationType).not.toHaveBeenCalled();
        expect(operationTracker.getStageProfiling).not.toHaveBeenCalled();
        expect(contractOpener.trackTransactionTree).not.toHaveBeenCalled();
    });
});
