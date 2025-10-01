import { ethers } from 'ethers';

import type { Asset } from '../../../src';
import { AssetFactory, AssetType, TACTransactionManager } from '../../../src';
import * as Utils from '../../../src/sdk/Utils';
import { Validator } from '../../../src/sdk/Validator';

const tvmValidatorSpy = jest.spyOn(Validator, 'validateTVMAddress').mockImplementation(() => undefined);

const tonAssetsStub = [{ amount: '5', tokenAddress: '0xToken', assetType: AssetType.FT } as never];
const mapAssetsToTonAssetsSpy = jest.spyOn(Utils, 'mapAssetsToTonAssets').mockReturnValue(tonAssetsStub);

const assetFactorySpy = jest.spyOn(AssetFactory, 'from');

describe('TACTransactionManager', () => {
    const operationTracker = {
        getTVMExecutorFee: jest.fn().mockResolvedValue({ inTAC: '33', inTON: '0' }),
    };

    const crossChainLayerSend = jest.fn().mockReturnValue({
        wait: jest.fn().mockResolvedValue(undefined),
        hash: '0xhash',
    });

    const crossChainLayer = {
        getAddress: jest.fn().mockResolvedValue('0xCrossChainLayer'),
        getProtocolFee: jest.fn().mockResolvedValue(5n),
        connect: jest.fn().mockReturnValue({ sendMessage: crossChainLayerSend }),
    };

    const config = {
        TACParams: {
            crossChainLayer,
            provider: {} as never,
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
    } as never;

    const signer = { address: '0xSigner' } as ethers.Wallet;

    const erc20Approve = jest.fn().mockResolvedValue({ wait: jest.fn().mockResolvedValue(undefined) });
    const erc721Approve = jest.fn().mockResolvedValue({ wait: jest.fn().mockResolvedValue(undefined) });

    const erc20Contract = { connect: jest.fn().mockReturnValue({ approve: erc20Approve }) };
    const erc721Contract = { connect: jest.fn().mockReturnValue({ approve: erc721Approve }) };

    const contractMock = jest
        .spyOn(ethers, 'Contract')
        .mockImplementation((target: string | ethers.Addressable, _abi: ethers.Interface | ethers.InterfaceAbi) => {
            const address = typeof target === 'string' ? target : (target as any).address || target.toString();
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
        crossChainLayerSend.mockReturnValue({ wait: jest.fn().mockResolvedValue(undefined), hash: '0xhash' });
        assetFactorySpy.mockResolvedValue({
            type: AssetType.FT,
            rawAmount: 0n,
            withRawAmount: (amount: bigint) =>
                ({
                    type: AssetType.FT,
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
        const manager = new TACTransactionManager(config, operationTracker as never, logger as never);

        const ftAsset = {
            type: AssetType.FT,
            rawAmount: 10n,
            getEVMAddress: jest.fn().mockResolvedValue('0xFT'),
        } as unknown as Asset;

        const nftAsset = {
            type: AssetType.NFT,
            rawAmount: 1n,
            getEVMAddress: jest.fn().mockResolvedValue('0xNFT'),
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
        expect(operationTracker.getTVMExecutorFee).toHaveBeenCalledWith({
            feeSymbol: 'TAC',
            tonAssets: tonAssetsStub,
            tvmValidExecutors: [],
        });
        expect(crossChainLayerSend).toHaveBeenCalledWith(1n, 'encoded', { value: 63n });
    });
});
