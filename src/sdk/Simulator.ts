import { Address, toNano } from '@ton/ton';

import { IConfiguration, ILogger, IOperationTracker, ISimulator } from '../interfaces';
import type { SenderAbstraction } from '../sender';
import {
    CrosschainTx,
    ExecutionFeeEstimationResult,
    FeeParams,
} from '../structs/Struct';
import { NoopLogger } from './Logger';
import { aggregateTokens, formatSolidityMethodName, generateTransactionLinker, mapAssetsToTonAssets } from './Utils';
import { Validator } from './Validator';

export class Simulator implements ISimulator {
    private readonly config: IConfiguration;
    private readonly operationTracker: IOperationTracker;
    private readonly logger: ILogger;

    constructor(config: IConfiguration, operationTracker: IOperationTracker, logger: ILogger = new NoopLogger()) {
        this.config = config;
        this.operationTracker = operationTracker;
        this.logger = logger;
    }

    async getSimulationsInfo(sender: SenderAbstraction, txs: CrosschainTx[]): Promise<ExecutionFeeEstimationResult[]> {
        this.logger.debug(`Simulating ${txs.length} TAC messages`);
        const results: ExecutionFeeEstimationResult[] = [];

        for (const tx of txs) {
            const result = await this.getSimulationInfo(sender, tx);
            results.push(result);
        }

        return results;
    }

    async getSimulationInfo(sender: SenderAbstraction, tx: CrosschainTx): Promise<ExecutionFeeEstimationResult> {
        this.logger.debug('Getting simulation info');

        const { evmProxyMsg, assets = [], options = {} } = tx;
        const {
            evmValidExecutors = this.config.TACParams.trustedTACExecutors,
            tvmValidExecutors = this.config.TACParams.trustedTONExecutors,
            calculateRollbackFee = true,
            allowSimulationError = false,
        } = options;

        Validator.validateEVMAddress(evmProxyMsg.evmTargetAddress);
        Validator.validateEVMAddresses(evmValidExecutors);
        Validator.validateTVMAddresses(tvmValidExecutors);

        const aggregatedData = await aggregateTokens(assets);
        const shardCount = aggregatedData.jettons.length || 1;
        const transactionLinker = generateTransactionLinker(sender.getSenderAddress(), shardCount);

        const tacSimulationParams = {
            tacCallParams: {
                arguments: evmProxyMsg.encodedParameters ?? '0x',
                methodName: formatSolidityMethodName(evmProxyMsg.methodName),
                target: evmProxyMsg.evmTargetAddress,
            },
            evmValidExecutors,
            tvmValidExecutors,
            extraData: '0x',
            shardsKey: transactionLinker.shardsKey,
            tonAssets: mapAssetsToTonAssets(assets),
            tonCaller: transactionLinker.caller,
            calculateRollbackFee,
        }

        const simulation = await this.operationTracker.simulateTACMessage(tacSimulationParams);
        this.logger.debug(`TAC simulation ${simulation.simulationStatus ? 'success' : 'failed'}`);

        const isRoundTrip = options.isRoundTrip ?? assets.length !== 0;

        const CrossChainLayerC = this.config.artifacts.ton.wrappers.CrossChainLayer;

        const crossChainLayer = this.config.TONParams.contractOpener.open(
            CrossChainLayerC.createFromAddress(
                Address.parse(this.config.TONParams.crossChainLayerAddress),
            ),
        );
        const fullStateCCL = await crossChainLayer.getFullData();

        const feeParams: FeeParams = {
            isRoundTrip,
            gasLimit: simulation.simulationStatus ? simulation.estimatedGas : 0n,
            protocolFee:
                BigInt(toNano(fullStateCCL.tacProtocolFee!)) +
                BigInt(isRoundTrip) * BigInt(toNano(fullStateCCL.tonProtocolFee!)),
            evmExecutorFee: BigInt(simulation.suggestedTacExecutionFee),
            tvmExecutorFee: BigInt(simulation.suggestedTonExecutionFee) * BigInt(isRoundTrip),
        };

        if (!simulation.simulationStatus && !allowSimulationError) {
            throw simulation;
        }

        if (allowSimulationError && !simulation.simulationStatus) {
            this.logger.info('Simulation failed but allowSimulationError is true, returning partial fee params');
        }

        return { feeParams, simulation };
    }
}
