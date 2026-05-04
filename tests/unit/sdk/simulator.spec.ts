import { beginCell } from '@ton/ton';

import { AssetFeeMode, AssetType, Origin, Simulator, TON } from '../../../src';
import { DEFAULT_CONTRACT_FEE_USAGE_PARAMS } from '../../../src/sdk/Fees';
import { Validator } from '../../../src/sdk/Validator';

const validateEVMAddressSpy = jest.spyOn(Validator, 'validateEVMAddress').mockImplementation(() => undefined);
const validateEVMAddressesSpy = jest.spyOn(Validator, 'validateEVMAddresses').mockImplementation(() => undefined);
const validateTVMAddressesSpy = jest.spyOn(Validator, 'validateTVMAddresses').mockImplementation(() => undefined);

describe('Simulator', () => {
    const simulateTACMessage = jest.fn();
    const operationTracker = {
        simulateTACMessage,
    };

    const crossChainLayerContract = {
        getFullData: jest.fn().mockResolvedValue({
            tacProtocolFee: '0.1',
            tonProtocolFee: '0.2',
        }),
    };

    const contractOpener = {
        open: jest.fn(() => crossChainLayerContract),
    };

    const config = {
        TACParams: {
            trustedTACExecutors: ['0xExecutor'],
            trustedTONExecutors: ['EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N'],
        },
        TONParams: {
            contractOpener,
            crossChainLayerAddress: 'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N',
        },
        artifacts: {
            ton: {
                wrappers: {
                    CrossChainLayer: {
                        createFromAddress: jest.fn(() => ({})),
                    },
                },
            },
        },
    };

    const sender = {
        getSenderAddress: jest.fn(() => 'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N'),
    };

    const logger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        crossChainLayerContract.getFullData.mockResolvedValue({
            tacProtocolFee: '0.1',
            tonProtocolFee: '0.2',
        });
    });

    afterAll(() => {
        validateEVMAddressSpy.mockRestore();
        validateEVMAddressesSpy.mockRestore();
        validateTVMAddressesSpy.mockRestore();
    });

    it('computes fee parameters based on TAC simulation', async () => {
        simulateTACMessage.mockResolvedValue({
            simulationStatus: true,
            estimatedGas: 200n,
            suggestedTacExecutionFee: '123',
            suggestedTonExecutionFee: '456',
            outMessages: [],
        });

        const simulator = new Simulator(config as never, operationTracker as never, logger as never);
        const result = await simulator.getSimulationInfo(sender as never, {
            evmProxyMsg: {
                evmTargetAddress: '0x1234567890123456789012345678901234567890',
            },
        });

        expect(simulateTACMessage).toHaveBeenCalled();
        expect(contractOpener.open).toHaveBeenCalled();
        expect(validateEVMAddressSpy).toHaveBeenCalledWith('0x1234567890123456789012345678901234567890');
        expect(validateEVMAddressesSpy).toHaveBeenCalled();
        expect(validateTVMAddressesSpy).toHaveBeenCalled();
        expect(result.feeParams).toEqual({
            isRoundTrip: false,
            gasLimit: 200n,
            protocolFee: expect.any(BigInt),
            evmExecutorFee: 123n,
            tvmExecutorFee: 0n,
        });
        expect(result.feeParams.protocolFee).toBeGreaterThan(0n);
    });

    it('returns partial results when simulation fails but errors are allowed', async () => {
        simulateTACMessage.mockResolvedValue({
            simulationStatus: false,
            estimatedGas: 0n,
            suggestedTacExecutionFee: '0',
            suggestedTonExecutionFee: '0',
            outMessages: [],
        });

        const simulator = new Simulator(config as never, operationTracker as never, logger as never);
        const result = await simulator.getSimulationInfo(sender as never, {
            evmProxyMsg: {
                evmTargetAddress: '0x1234567890123456789012345678901234567890',
            },
            options: {
                allowSimulationError: true,
            },
        });

        expect(result.feeParams.isRoundTrip).toBe(false);
        expect(logger.info).toHaveBeenCalledWith(
            'Simulation failed but allowSimulationError is true, returning partial fee params',
        );
    });

    it('uses standard jetton wallet minimum for legacy TON-origin FT fee estimation', () => {
        const simulator = new Simulator(
            {
                TONParams: {
                    feesParams: {
                        accountBitPrice: 0,
                        accountCellPrice: 0,
                        lumpPrice: 0,
                        gasPrice: 0,
                        firstFrac: 0,
                        ihrPriceFactor: 0,
                        msgBitPrice: 0,
                        msgCellPrice: 0,
                    },
                    contractFeeUsageParams: DEFAULT_CONTRACT_FEE_USAGE_PARAMS,
                },
            } as never,
            operationTracker as never,
            logger as never,
        );
        const legacyAsset = {
            type: AssetType.FT,
            origin: Origin.TON,
            feeMode: AssetFeeMode.LEGACY,
            generatePayload: jest.fn(() => beginCell().storeUint(0, 32).endCell()),
        };
        const dynamicAsset = {
            ...legacyAsset,
            feeMode: AssetFeeMode.DYNAMIC,
        };
        const params = {
            excessReceiver: 'EQReceiver',
            evmData: beginCell().endCell(),
        };

        const legacyFee = simulator.estimateTONFee(legacyAsset as never, params);
        const dynamicFee = simulator.estimateTONFee(dynamicAsset as never, params);

        expect(legacyFee).toBe(40_000_001n);
        expect(dynamicFee).toBe(0n);
    });

    it('uses standard NFT item storage minimum for legacy TON-origin NFT fee estimation', () => {
        const simulator = new Simulator(
            {
                TONParams: {
                    feesParams: {
                        accountBitPrice: 0,
                        accountCellPrice: 0,
                        lumpPrice: 0,
                        gasPrice: 0,
                        firstFrac: 0,
                        ihrPriceFactor: 0,
                        msgBitPrice: 0,
                        msgCellPrice: 0,
                    },
                    contractFeeUsageParams: DEFAULT_CONTRACT_FEE_USAGE_PARAMS,
                },
            } as never,
            operationTracker as never,
            logger as never,
        );
        const legacyAsset = {
            type: AssetType.NFT,
            origin: Origin.TON,
            feeMode: AssetFeeMode.LEGACY,
            generatePayload: jest.fn(() => beginCell().storeUint(0, 32).endCell()),
        };
        const dynamicAsset = {
            ...legacyAsset,
            feeMode: AssetFeeMode.DYNAMIC,
        };
        const params = {
            excessReceiver: 'EQReceiver',
            evmData: beginCell().endCell(),
        };

        const legacyFee = simulator.estimateTONFee(legacyAsset as never, params);
        const dynamicFee = simulator.estimateTONFee(dynamicAsset as never, params);

        expect(legacyFee).toBe(50_000_000n);
        expect(dynamicFee).toBe(0n);
    });

    it('marks native TON as dynamic fee mode', () => {
        expect(TON.create({} as never).feeMode).toBe(AssetFeeMode.DYNAMIC);
    });
});
