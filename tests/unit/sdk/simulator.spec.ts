import { Simulator } from '../../../src';
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
        const result = await simulator.getSimulationInfo(
            sender as never,
            {
                evmProxyMsg: {
                    evmTargetAddress: '0x1234567890123456789012345678901234567890',
                },
            },
        );

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
        const result = await simulator.getSimulationInfo(
            sender as never,
            {
                evmProxyMsg: {
                    evmTargetAddress: '0x1234567890123456789012345678901234567890',
                },
                options: {
                    allowSimulationError: true,
                },
            },
        );

        expect(result.feeParams.isRoundTrip).toBe(false);
        expect(logger.info).toHaveBeenCalledWith(
            'Simulation failed but allowSimulationError is true, returning partial fee params',
        );
    });
});
