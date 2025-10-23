import { Address, toNano } from '@ton/ton';

import { TON } from '../assets';
import { unknownTokenTypeError } from '../errors';
import { Asset, IConfiguration, ILogger, IOperationTracker, ISimulator } from '../interfaces';
import type { SenderAbstraction } from '../sender';
import { AssetType, CrosschainTx, ExecutionFeeEstimationResult, FeeParams, Origin } from '../structs/Struct';
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

    calculateTONFees({
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
    }: {
        accountBits: number;
        accountCells: number;
        timeDelta: number;
        msgBits: number;
        msgCells: number;
        gasUsed: number;
        bitPricePs?: number;
        cellPricePs?: number;
        lumpPrice?: number;
        gasPrice?: number;
        firstFrac?: number;
        ihrPriceFactor?: number;
    }): number {
        // Storage Fee (nanotons)
        const storageFee = Math.ceil(((accountBits * bitPricePs + accountCells * cellPricePs) * timeDelta) / 2 ** 16);

        // Computation Fee (nanotons)
        const computeFee = gasUsed * gasPrice;

        // Forwarding Fee (nanotons)
        const msgFwdFees = lumpPrice + Math.ceil((bitPricePs * msgBits + cellPricePs * msgCells) / 2 ** 16);
        const ihrFwdFees = Math.ceil((msgFwdFees * ihrPriceFactor) / 2 ** 16);
        const totalFwdFees = msgFwdFees + ihrFwdFees;

        // Action Fee (nanotons)
        const actionFee = Math.floor((msgFwdFees * firstFrac) / 2 ** 16);

        // Combine all fees
        const totalFees = storageFee + computeFee + actionFee + totalFwdFees;

        return totalFees;
    }

    private readonly TON_FEE_CONSTANTS = {
        messageSizes: {
            jetton: { bits: 1500, cells: 4 },
            nft: { bits: 1300, cells: 4 },
            ton: { bits: 500, cells: 1 },
        },
        walletSendTokenPrice: 0.006 * 10 ** 9, // 0.006 TON in nanotons
        storageTimeDelta: 1 * 24 * 3600, // 1 day in seconds
        messageOverhead: { bits: 847, cells: 3 },
    } as const;

    private readonly TRANSACTION_STEPS = {
        crossChainLayer: {
            accountBits: 34534,
            accountCells: 85,
            gasUsed: 13636,
        },
        jettonWallet: {
            accountBits: 949,
            accountCells: 3,
            gasUsed: 11000,
        },
        jettonWalletTransfer: {
            accountBits: 949,
            accountCells: 3,
            gasUsed: 12000,
        },
        jettonWalletBurn: {
            accountBits: 949,
            accountCells: 3,
            gasUsed: 8653,
        },
        jettonProxy: {
            accountBits: 7760,
            accountCells: 16,
            gasUsed: 8515,
        },
        jettonMinter: {
            accountBits: 10208,
            accountCells: 28,
            gasUsed: 10357,
        },
        nftItem: {
            accountBits: 1422,
            accountCells: 5,
            gasUsed: 11722,
        },
        nftItemBurn: {
            accountBits: 1422,
            accountCells: 5,
            gasUsed: 11552,
        },
        nftProxy: {
            accountBits: 7512,
            accountCells: 15,
            gasUsed: 7688,
        },
    } as const;

    private calculateStepFee(
        step: { accountBits: number; accountCells: number; gasUsed: number },
        messageSize: { bits: number; cells: number },
    ): number {
        return this.calculateTONFees({
            ...step,
            timeDelta: this.TON_FEE_CONSTANTS.storageTimeDelta,
            msgBits: messageSize.bits,
            msgCells: messageSize.cells,
        });
    }

    private calculateTransactionPipeline(steps: Array<{
        step: { accountBits: number; accountCells: number; gasUsed: number };
        messageSize: { bits: number; cells: number };
    }>): number {
        return steps.reduce((total, { step, messageSize }) => 
            total + this.calculateStepFee(step, messageSize), 
            this.TON_FEE_CONSTANTS.walletSendTokenPrice
        );
    }

    estimateTONFees(assets: Asset[]): number {
        const { messageSizes, messageOverhead } = this.TON_FEE_CONSTANTS;

        return assets.reduce((totalFees, asset) => {
            const assetFee = (() => {
                switch (asset.type) {
                    case AssetType.FT:
                        if (asset instanceof TON) {
                            // Pipeline: wallet -> ccl -> log
                            return this.calculateTransactionPipeline([
                                { step: this.TRANSACTION_STEPS.crossChainLayer, messageSize: messageSizes.ton },
                            ]);
                        }
                        if (asset.origin === Origin.TON) {
                            // Pipeline: wallet -> jetton wallet -> jetton wallet -> jetton proxy -> ccl -> log
                            return this.calculateTransactionPipeline([
                                { 
                                    step: this.TRANSACTION_STEPS.jettonWallet, 
                                    messageSize: {
                                        bits: messageSizes.jetton.bits + messageOverhead.bits,
                                        cells: messageSizes.jetton.cells + messageOverhead.cells,
                                    },
                                },
                                { step: this.TRANSACTION_STEPS.jettonWalletTransfer, messageSize: messageSizes.jetton },
                                { step: this.TRANSACTION_STEPS.jettonProxy, messageSize: messageSizes.jetton },
                                { step: this.TRANSACTION_STEPS.crossChainLayer, messageSize: messageSizes.jetton },
                            ]);
                        }
                        if (asset.origin === Origin.TAC) {
                            // Pipeline: wallet -> jetton wallet -> jetton minter -> ccl -> log
                            return this.calculateTransactionPipeline([
                                { 
                                    step: this.TRANSACTION_STEPS.jettonWalletBurn, 
                                    messageSize: {
                                        bits: messageSizes.jetton.bits + messageOverhead.bits,
                                        cells: messageSizes.jetton.cells + messageOverhead.cells,
                                    },
                                },
                                { step: this.TRANSACTION_STEPS.jettonMinter, messageSize: messageSizes.jetton },
                                { step: this.TRANSACTION_STEPS.crossChainLayer, messageSize: messageSizes.jetton },
                            ]);
                        }
                        return 0;
                    
                    case AssetType.NFT:
                        if (asset.origin === Origin.TON) {
                            // Pipeline: wallet -> nft item -> nft proxy -> ccl -> log
                            return this.calculateTransactionPipeline([
                                { step: this.TRANSACTION_STEPS.nftItem, messageSize: messageSizes.nft },
                                { step: this.TRANSACTION_STEPS.nftProxy, messageSize: messageSizes.nft },
                                { step: this.TRANSACTION_STEPS.crossChainLayer, messageSize: messageSizes.nft },
                            ]);
                        }
                        if (asset.origin === Origin.TAC) {
                            // Pipeline: wallet -> nft item -> ccl -> log
                            return this.calculateTransactionPipeline([
                                { step: this.TRANSACTION_STEPS.nftItemBurn, messageSize: messageSizes.nft },
                                { step: this.TRANSACTION_STEPS.crossChainLayer, messageSize: messageSizes.nft },
                            ]);
                        }
                        return 0;
                    
                    default:
                        throw unknownTokenTypeError(asset.type);
                }
            })();

            return totalFees + assetFee;
        }, 0);
    }
}
