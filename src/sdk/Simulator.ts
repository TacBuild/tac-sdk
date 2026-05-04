import { Address, toNano } from '@ton/ton';

import { TON } from '../assets';
import { unknownTokenTypeError } from '../errors';
import { unknownAssetOriginError } from '../errors/instances';
import { Asset, IConfiguration, ILogger, IOperationTracker, ISimulator } from '../interfaces';
import type { SenderAbstraction } from '../sender';
import { TONFeeCalculationParams, TransactionFeeCalculationStep } from '../structs/InternalStruct';
import {
    AssetFeeMode,
    AssetType,
    CrosschainTx,
    ExecutionFeeEstimationResult,
    FeeParams,
    GeneratePayloadParams,
    Origin,
} from '../structs/Struct';
import {
    FIXED_POINT_SHIFT,
    JETTON_TRANSFER_FORWARD_TON_AMOUNT,
    LEGACY_FORWARD_FEE_ESTIMATE_DENOMINATOR,
    LEGACY_FORWARD_FEE_ESTIMATE_NUMERATOR,
    LEGACY_JETTON_TRANSFER_BASE_OUTBOUND_MESSAGE_COUNT,
    LEGACY_JETTON_TRANSFER_WITH_FORWARD_OUTBOUND_MESSAGE_COUNT,
    LEGACY_JETTON_WALLET_TRANSFER_GAS_AND_STORAGE,
    LEGACY_NFT_ITEM_MIN_TONS_FOR_STORAGE,
    LEGACY_NFT_TRANSFER_BASE_OUTBOUND_MESSAGE_COUNT,
    LEGACY_NFT_TRANSFER_WITH_FORWARD_OUTBOUND_MESSAGE_COUNT,
    LEGACY_STRICTLY_GREATER_THAN_FEE_EPSILON,
    NFT_TRANSFER_FORWARD_TON_AMOUNT,
} from './Consts';
import {
    createCrossChainLayerTvmMsgToEvmStep,
    createErrorNotificationGasStep,
    createEstimatedReceiveTransferGasStep,
    createEstimatedSendTransferGasStep,
    createJettonMinterBurnNotificationStep,
    createJettonProxyOwnershipAssignedStep,
    createJettonWalletBurnStep,
    createJettonWalletInternalTransferStep,
    createJettonWalletReceiveStep,
    createMintAfterErrorGasStep,
    createNftItemBurnStep,
    createNftItemErrorNotificationStep,
    createNftItemSendStep,
    createNftProxyErrorNotificationStep,
    createNftProxyOwnershipAssignedStep,
} from './Fees';
import { NoopLogger } from './Logger';
import {
    aggregateTokens,
    formatSolidityMethodName,
    generateTransactionLinker,
    mapAssetsToTonAssets,
    recurisivelyCollectCellStats,
} from './Utils';
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

        const aggregatedData = aggregateTokens(assets);
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
        };

        const simulation = await this.operationTracker.simulateTACMessage(tacSimulationParams);
        this.logger.debug(`TAC simulation ${simulation.simulationStatus ? 'success' : 'failed'}`);

        const isRoundTrip = options.isRoundTrip ?? (assets.length !== 0 || simulation.outMessages?.length !== 0);

        const CrossChainLayerC = this.config.artifacts.ton.wrappers.CrossChainLayer;

        const crossChainLayer = this.config.TONParams.contractOpener.open(
            CrossChainLayerC.createFromAddress(Address.parse(this.config.TONParams.crossChainLayerAddress)),
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

    private calculateTONFees({
        // Contract usage
        accountBits,
        accountCells,
        timeDelta,

        // Message size
        msgBits,
        msgCells,

        // Gas and computation
        gasUsed,

        accountBitPrice,
        accountCellPrice,
        lumpPrice,
        gasPrice,
        firstFrac,
        ihrPriceFactor,
        msgBitPrice,
        msgCellPrice,
    }: TONFeeCalculationParams): bigint {
        // Storage Fee (nanotons)
        const storageFee = Math.ceil(
            ((accountBits * accountBitPrice + accountCells * accountCellPrice) * timeDelta) / FIXED_POINT_SHIFT,
        );

        // Computation Fee (nanotons)
        const computeFee = (gasUsed * gasPrice) / FIXED_POINT_SHIFT;

        // Forwarding Fee (nanotons)
        const msgFwdFees = lumpPrice + Math.ceil((msgBitPrice * msgBits + msgCellPrice * msgCells) / FIXED_POINT_SHIFT);
        const ihrFwdFees = Math.ceil((msgFwdFees * ihrPriceFactor) / FIXED_POINT_SHIFT);
        const totalFwdFees = msgFwdFees + ihrFwdFees;

        // Action Fee (nanotons)
        const actionFee = Math.floor((msgFwdFees * firstFrac) / FIXED_POINT_SHIFT);

        // Combine all fees
        const totalFees = storageFee + computeFee + actionFee + totalFwdFees;

        return BigInt(Math.ceil(totalFees));
    }

    private calculateTransactionPipeline(steps: Array<TransactionFeeCalculationStep>): bigint {
        return steps.reduce(
            (total, step) => total + this.calculateTONFees({ ...step, ...this.config.TONParams.feesParams }),
            0n,
        );
    }

    private calculateMessageForwardFee(msgBits: number, msgCells: number): bigint {
        const { lumpPrice, msgBitPrice, msgCellPrice } = this.config.TONParams.feesParams;
        const msgFwdFees = lumpPrice + Math.ceil((msgBitPrice * msgBits + msgCellPrice * msgCells) / FIXED_POINT_SHIFT);

        return BigInt(msgFwdFees);
    }

    private calculateLegacyJettonTransferNetworkFee(
        params: GeneratePayloadParams,
        msgBits: number,
        msgCells: number,
    ): bigint {
        const forwardTonAmount =
            JETTON_TRANSFER_FORWARD_TON_AMOUNT +
            (params.forwardFeeTonAmount ?? 0n) +
            (params.crossChainTonAmount ?? 0n);
        const outboundMessageCount =
            forwardTonAmount > 0n
                ? LEGACY_JETTON_TRANSFER_WITH_FORWARD_OUTBOUND_MESSAGE_COUNT
                : LEGACY_JETTON_TRANSFER_BASE_OUTBOUND_MESSAGE_COUNT;
        const inboundForwardFee =
            (this.calculateMessageForwardFee(msgBits, msgCells) * LEGACY_FORWARD_FEE_ESTIMATE_NUMERATOR) /
            LEGACY_FORWARD_FEE_ESTIMATE_DENOMINATOR;

        return (
            outboundMessageCount * inboundForwardFee +
            LEGACY_JETTON_WALLET_TRANSFER_GAS_AND_STORAGE +
            LEGACY_STRICTLY_GREATER_THAN_FEE_EPSILON
        );
    }

    private calculateTONCrosschainFee(msgBits: number, msgCells: number): bigint {
        return this.calculateTransactionPipeline([
            createCrossChainLayerTvmMsgToEvmStep(this.config.TONParams.contractFeeUsageParams, msgBits, msgCells),
        ]);
    }

    private calculateJettonTransferCrosschainFee(msgBits: number, msgCells: number): bigint {
        return this.calculateTransactionPipeline([
            createJettonWalletInternalTransferStep(this.config.TONParams.contractFeeUsageParams, msgBits, msgCells),
            createJettonWalletReceiveStep(this.config.TONParams.contractFeeUsageParams, msgBits, msgCells),
            createJettonProxyOwnershipAssignedStep(this.config.TONParams.contractFeeUsageParams, msgBits, msgCells),
            createCrossChainLayerTvmMsgToEvmStep(this.config.TONParams.contractFeeUsageParams, msgBits, msgCells),
            createErrorNotificationGasStep(this.config.TONParams.contractFeeUsageParams, msgBits, msgCells),
            createEstimatedSendTransferGasStep(this.config.TONParams.contractFeeUsageParams, msgBits, msgCells),
            createEstimatedReceiveTransferGasStep(this.config.TONParams.contractFeeUsageParams, msgBits, msgCells),
        ]);
    }

    private calculateLegacyJettonTransferCrosschainFee(
        params: GeneratePayloadParams,
        msgBits: number,
        msgCells: number,
    ): bigint {
        const dynamicFee = this.calculateJettonTransferCrosschainFee(msgBits, msgCells);
        const legacyNetworkFee = this.calculateLegacyJettonTransferNetworkFee(params, msgBits, msgCells);

        return dynamicFee > legacyNetworkFee ? dynamicFee : legacyNetworkFee;
    }

    private calculateLegacyNftTransferNetworkFee(
        params: GeneratePayloadParams,
        msgBits: number,
        msgCells: number,
    ): bigint {
        const forwardTonAmount =
            NFT_TRANSFER_FORWARD_TON_AMOUNT +
            (params.forwardFeeTonAmount ?? 0n) +
            (params.crossChainTonAmount ?? 0n);
        const outboundMessageCount =
            forwardTonAmount > 0n
                ? LEGACY_NFT_TRANSFER_WITH_FORWARD_OUTBOUND_MESSAGE_COUNT
                : LEGACY_NFT_TRANSFER_BASE_OUTBOUND_MESSAGE_COUNT;
        const inboundForwardFee =
            (this.calculateMessageForwardFee(msgBits, msgCells) * LEGACY_FORWARD_FEE_ESTIMATE_NUMERATOR) /
            LEGACY_FORWARD_FEE_ESTIMATE_DENOMINATOR;

        return outboundMessageCount * inboundForwardFee + LEGACY_NFT_ITEM_MIN_TONS_FOR_STORAGE;
    }

    private calculateLegacyNftTransferCrosschainFee(
        params: GeneratePayloadParams,
        msgBits: number,
        msgCells: number,
    ): bigint {
        const dynamicFee = this.calculateNftTransferCrosschainFee(msgBits, msgCells);
        const legacyNetworkFee = this.calculateLegacyNftTransferNetworkFee(params, msgBits, msgCells);

        return dynamicFee > legacyNetworkFee ? dynamicFee : legacyNetworkFee;
    }

    private calculateJettonBurnCrosschainFee(msgBits: number, msgCells: number): bigint {
        return this.calculateTransactionPipeline([
            createJettonWalletBurnStep(this.config.TONParams.contractFeeUsageParams, msgBits, msgCells),
            createJettonMinterBurnNotificationStep(this.config.TONParams.contractFeeUsageParams, msgBits, msgCells),
            createCrossChainLayerTvmMsgToEvmStep(this.config.TONParams.contractFeeUsageParams, msgBits, msgCells),
            createMintAfterErrorGasStep(this.config.TONParams.contractFeeUsageParams, msgBits, msgCells),
            createJettonWalletReceiveStep(this.config.TONParams.contractFeeUsageParams, msgBits, msgCells),
        ]);
    }

    private calculateNftTransferCrosschainFee(msgBits: number, msgCells: number): bigint {
        return this.calculateTransactionPipeline([
            createNftItemSendStep(this.config.TONParams.contractFeeUsageParams, msgBits, msgCells),
            createNftProxyOwnershipAssignedStep(this.config.TONParams.contractFeeUsageParams, msgBits, msgCells),
            createCrossChainLayerTvmMsgToEvmStep(this.config.TONParams.contractFeeUsageParams, msgBits, msgCells),
            createNftProxyErrorNotificationStep(this.config.TONParams.contractFeeUsageParams, msgBits, msgCells),
            createNftItemSendStep(this.config.TONParams.contractFeeUsageParams, msgBits, msgCells),
        ]);
    }

    private calculateNftBurnCrosschainFee(msgBits: number, msgCells: number): bigint {
        return this.calculateTransactionPipeline([
            createNftItemBurnStep(this.config.TONParams.contractFeeUsageParams, msgBits, msgCells),
            createCrossChainLayerTvmMsgToEvmStep(this.config.TONParams.contractFeeUsageParams, msgBits, msgCells),
            createNftItemErrorNotificationStep(this.config.TONParams.contractFeeUsageParams),
        ]);
    }

    estimateTONFee(asset: Asset, params: GeneratePayloadParams): bigint {
        const payload = asset.generatePayload(params);
        const { bits: msgBits, cells: msgCells } = recurisivelyCollectCellStats(payload);
        switch (asset.type) {
            case AssetType.FT:
                if (asset instanceof TON) {
                    // Pipeline: wallet -> ccl -> log
                    return this.calculateTONCrosschainFee(msgBits, msgCells);
                }
                if (asset.origin === Origin.TON) {
                    // Pipeline: wallet -> jetton wallet -> jetton wallet -> jetton proxy -> ccl -> log
                    if (asset.feeMode === AssetFeeMode.LEGACY) {
                        return this.calculateLegacyJettonTransferCrosschainFee(params, msgBits, msgCells);
                    }
                    return this.calculateJettonTransferCrosschainFee(msgBits, msgCells);
                }
                if (asset.origin === Origin.TAC) {
                    // Pipeline: wallet -> jetton wallet -> jetton minter -> ccl -> log
                    return this.calculateJettonBurnCrosschainFee(msgBits, msgCells);
                }
                throw unknownAssetOriginError(asset.origin);

            case AssetType.NFT:
                if (asset.origin === Origin.TON) {
                    // Pipeline: wallet -> nft item -> nft proxy -> ccl -> log
                    if (asset.feeMode === AssetFeeMode.LEGACY) {
                        return this.calculateLegacyNftTransferCrosschainFee(params, msgBits, msgCells);
                    }
                    return this.calculateNftTransferCrosschainFee(msgBits, msgCells);
                }
                if (asset.origin === Origin.TAC) {
                    // Pipeline: wallet -> nft item -> ccl -> log
                    return this.calculateNftBurnCrosschainFee(msgBits, msgCells);
                }
                throw unknownAssetOriginError(asset.origin);

            default:
                throw unknownTokenTypeError(asset.type);
        }
    }
}
