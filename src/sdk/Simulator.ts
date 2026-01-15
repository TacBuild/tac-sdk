import { Address, toNano } from '@ton/ton';

import { TON } from '../assets';
import { unknownTokenTypeError } from '../errors';
import { unknownAssetOriginError } from '../errors/instances';
import { Asset, IConfiguration, ILogger, IOperationTracker, ISimulator } from '../interfaces';
import type { SenderAbstraction } from '../sender';
import { TONFeeCalculationParams, TransactionFeeCalculationStep } from '../structs/InternalStruct';
import {
    AssetType,
    CrosschainTx,
    ExecutionFeeEstimationResult,
    FeeParams,
    GeneratePayloadParams,
    Origin,
} from '../structs/Struct';
import { CONTRACT_FEE_USAGE_PARAMS, FIXED_POINT_SHIFT, ONE_YEAR_SECONDS } from './Consts';
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

        // Config values (defaults for BaseChain)
        bitPricePs = 1,
        cellPricePs = 500,
        lumpPrice = 400000,
        gasPrice = 400,
        firstFrac = 21845,
        ihrPriceFactor = 0,
    }: TONFeeCalculationParams): bigint {
        // Storage Fee (nanotons)
        const storageFee = Math.ceil(
            ((accountBits * bitPricePs + accountCells * cellPricePs) * timeDelta) / FIXED_POINT_SHIFT,
        );

        // Computation Fee (nanotons)
        const computeFee = gasUsed * gasPrice;

        // Forwarding Fee (nanotons)
        const msgFwdFees = lumpPrice + Math.ceil((bitPricePs * msgBits + cellPricePs * msgCells) / FIXED_POINT_SHIFT);
        const ihrFwdFees = Math.ceil((msgFwdFees * ihrPriceFactor) / FIXED_POINT_SHIFT);
        const totalFwdFees = msgFwdFees + ihrFwdFees;

        // Action Fee (nanotons)
        const actionFee = Math.floor((msgFwdFees * firstFrac) / FIXED_POINT_SHIFT);

        // Combine all fees
        const totalFees = BigInt(storageFee) + BigInt(computeFee) + BigInt(actionFee) + BigInt(totalFwdFees);

        return totalFees;
    }

    private calculateTransactionPipeline(steps: Array<TransactionFeeCalculationStep>): bigint {
        return steps.reduce(
            (total, step) => total + this.calculateTONFees({ ...step, ...this.config.TONParams.feesParams }),
            0n,
        );
    }

    private calculateTONCrosschainFee(msgBits: number, msgCells: number): bigint {
        return this.calculateTransactionPipeline([
            {
                accountBits: CONTRACT_FEE_USAGE_PARAMS.crossChainLayer.accountBits,
                accountCells: CONTRACT_FEE_USAGE_PARAMS.crossChainLayer.accountCells,
                gasUsed: CONTRACT_FEE_USAGE_PARAMS.crossChainLayer.gas.tvmMsgToEvm,
                msgBits,
                msgCells,
                timeDelta: ONE_YEAR_SECONDS,
            },
        ]);
    }

    private calculateJettonTransferCrosschainFee(msgBits: number, msgCells: number): bigint {
        return this.calculateTransactionPipeline([
            {
                accountBits: CONTRACT_FEE_USAGE_PARAMS.jettonWallet.accountBits,
                accountCells: CONTRACT_FEE_USAGE_PARAMS.jettonWallet.accountCells,
                gasUsed: CONTRACT_FEE_USAGE_PARAMS.jettonWallet.gas.internalTransfer,
                msgBits,
                msgCells,
                timeDelta: ONE_YEAR_SECONDS,
            },
            {
                accountBits: CONTRACT_FEE_USAGE_PARAMS.jettonWallet.accountBits,
                accountCells: CONTRACT_FEE_USAGE_PARAMS.jettonWallet.accountCells,
                gasUsed: CONTRACT_FEE_USAGE_PARAMS.jettonWallet.gas.receive,
                msgBits,
                msgCells,
                timeDelta: ONE_YEAR_SECONDS,
            },
            {
                accountBits: CONTRACT_FEE_USAGE_PARAMS.jettonProxy.accountbits,
                accountCells: CONTRACT_FEE_USAGE_PARAMS.jettonProxy.accountCells,
                gasUsed: CONTRACT_FEE_USAGE_PARAMS.jettonProxy.gas.ownershipAssigned,
                msgBits,
                msgCells,
                timeDelta: ONE_YEAR_SECONDS,
            },
            {
                accountBits: CONTRACT_FEE_USAGE_PARAMS.crossChainLayer.accountBits,
                accountCells: CONTRACT_FEE_USAGE_PARAMS.crossChainLayer.accountCells,
                gasUsed: CONTRACT_FEE_USAGE_PARAMS.crossChainLayer.gas.tvmMsgToEvm,
                msgBits,
                msgCells,
                timeDelta: ONE_YEAR_SECONDS,
            },
        ]);
    }

    private calculateJettonBurnCrosschainFee(msgBits: number, msgCells: number): bigint {
        return this.calculateTransactionPipeline([
            {
                accountBits: CONTRACT_FEE_USAGE_PARAMS.jettonWallet.accountBits,
                accountCells: CONTRACT_FEE_USAGE_PARAMS.jettonWallet.accountCells,
                gasUsed: CONTRACT_FEE_USAGE_PARAMS.jettonWallet.gas.burn,
                msgBits,
                msgCells,
                timeDelta: ONE_YEAR_SECONDS,
            },
            {
                accountBits: CONTRACT_FEE_USAGE_PARAMS.jettonMinter.accountBits,
                accountCells: CONTRACT_FEE_USAGE_PARAMS.jettonMinter.accountCells,
                gasUsed: CONTRACT_FEE_USAGE_PARAMS.jettonMinter.gas.burnNotification,
                msgBits,
                msgCells,
                timeDelta: ONE_YEAR_SECONDS,
            },
            {
                accountBits: CONTRACT_FEE_USAGE_PARAMS.crossChainLayer.accountBits,
                accountCells: CONTRACT_FEE_USAGE_PARAMS.crossChainLayer.accountCells,
                gasUsed: CONTRACT_FEE_USAGE_PARAMS.crossChainLayer.gas.tvmMsgToEvm,
                msgBits,
                msgCells,
                timeDelta: ONE_YEAR_SECONDS,
            },
        ]);
    }

    private calculateNftTransferCrosschainFee(msgBits: number, msgCells: number): bigint {
        return this.calculateTransactionPipeline([
            {
                accountBits: CONTRACT_FEE_USAGE_PARAMS.nftItem.accountBits,
                accountCells: CONTRACT_FEE_USAGE_PARAMS.nftItem.accountCells,
                gasUsed: CONTRACT_FEE_USAGE_PARAMS.nftItem.gas.send,
                msgBits,
                msgCells,
                timeDelta: ONE_YEAR_SECONDS,
            },
            {
                accountBits: CONTRACT_FEE_USAGE_PARAMS.nftProxy.accountBits,
                accountCells: CONTRACT_FEE_USAGE_PARAMS.nftProxy.accountCells,
                gasUsed: CONTRACT_FEE_USAGE_PARAMS.nftProxy.gas.ownershipAssigned,
                msgBits,
                msgCells,
                timeDelta: ONE_YEAR_SECONDS,
            },
            {
                accountBits: CONTRACT_FEE_USAGE_PARAMS.crossChainLayer.accountBits,
                accountCells: CONTRACT_FEE_USAGE_PARAMS.crossChainLayer.accountCells,
                gasUsed: CONTRACT_FEE_USAGE_PARAMS.crossChainLayer.gas.tvmMsgToEvm,
                msgBits,
                msgCells,
                timeDelta: ONE_YEAR_SECONDS,
            },
        ]);
    }

    private calculateNftBurnCrosschainFee(msgBits: number, msgCells: number): bigint {
        return this.calculateTransactionPipeline([
            {
                accountBits: CONTRACT_FEE_USAGE_PARAMS.nftItem.accountBits,
                accountCells: CONTRACT_FEE_USAGE_PARAMS.nftItem.accountCells,
                gasUsed: CONTRACT_FEE_USAGE_PARAMS.nftItem.gas.burn,
                msgBits,
                msgCells,
                timeDelta: ONE_YEAR_SECONDS,
            },
            {
                accountBits: CONTRACT_FEE_USAGE_PARAMS.crossChainLayer.accountBits,
                accountCells: CONTRACT_FEE_USAGE_PARAMS.crossChainLayer.accountCells,
                gasUsed: CONTRACT_FEE_USAGE_PARAMS.crossChainLayer.gas.tvmMsgToEvm,
                msgBits,
                msgCells,
                timeDelta: ONE_YEAR_SECONDS,
            },
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
