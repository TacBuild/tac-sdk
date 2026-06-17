import { Cell, loadMessage } from '@ton/ton';

import { FT, NFT, TON } from '../assets';
import {
    executedInTONStageFailedError,
    insufficientFeeParamsError,
    missingFeeParamsError,
    missingGasLimitError,
    missingTvmExecutorFeeError,
    operationIdRequiredForFinalizationError,
} from '../errors';
import { sendCrossChainTransactionFailedError } from '../errors/instances';
import { Asset, IConfiguration, ILogger, IOperationTracker, ISimulator, ITONTransactionManager } from '../interfaces';
import { getMockSender, type SenderAbstraction } from '../sender';
import { PreparedCrossChainTransaction, ShardMessage } from '../structs/InternalStruct';
import {
    BatchCrossChainTx,
    CrossChainPayloadResult,
    CrossChainTransactionOptions,
    CrossChainTransactionsOptions,
    CrosschainTx,
    EvmProxyMsg,
    ExecutionStages,
    FeeParams,
    GeneratePayloadParams,
    OperationIdsByShardsKey,
    TransactionLinker,
    TransactionLinkerWithOperationId,
    ValidExecutors,
    WaitOptions,
} from '../structs/Struct';
import { FIFTEEN_MINUTES, JETTON_TRANSFER_FORWARD_TON_AMOUNT, NFT_TRANSFER_FORWARD_TON_AMOUNT } from './Consts';
import { NoopLogger } from './Logger';
import {
    aggregateTokens,
    buildEvmDataCell,
    formatObjectForLogging,
    generateTransactionLinker,
    getNormalizedExtMessageHash,
    isFinalProfiling,
} from './Utils';
import { Validator } from './Validator';

export class TONTransactionManager implements ITONTransactionManager {
    constructor(
        private readonly config: IConfiguration,
        private readonly simulator: ISimulator,
        private readonly operationTracker: IOperationTracker,
        private readonly logger: ILogger = new NoopLogger(),
    ) {}

    async buildFeeParams(
        options: CrossChainTransactionOptions,
        evmProxyMsg: EvmProxyMsg,
        sender: SenderAbstraction,
        tx: CrosschainTx,
    ): Promise<FeeParams> {
        const {
            withoutSimulation,
            protocolFee,
            evmExecutorFee,
            tvmExecutorFee,
            isRoundTrip,
            shouldValidateFees = true,
        } = options;

        if (withoutSimulation) {
            if (protocolFee === undefined || evmExecutorFee === undefined) {
                throw missingFeeParamsError;
            }
            if (isRoundTrip && tvmExecutorFee === undefined) {
                throw missingTvmExecutorFeeError;
            }
            if (!evmProxyMsg.gasLimit) {
                throw missingGasLimitError;
            }

            return {
                protocolFee,
                evmExecutorFee,
                tvmExecutorFee: tvmExecutorFee || 0n,
                gasLimit: evmProxyMsg.gasLimit,
                isRoundTrip: isRoundTrip || false,
            };
        }

        const simulationResult = await this.simulator.getSimulationInfo(sender, tx);

        if (!evmProxyMsg.gasLimit) evmProxyMsg.gasLimit = simulationResult.feeParams.gasLimit;

        const shouldValidateSuggestedFees =
            shouldValidateFees && (simulationResult.simulation?.simulationStatus ?? true);
        if (shouldValidateSuggestedFees) {
            if (protocolFee !== undefined && protocolFee < simulationResult.feeParams.protocolFee) {
                throw insufficientFeeParamsError('protocolFee', protocolFee, simulationResult.feeParams.protocolFee);
            }
            if (evmExecutorFee !== undefined && evmExecutorFee < simulationResult.feeParams.evmExecutorFee) {
                throw insufficientFeeParamsError(
                    'evmExecutorFee',
                    evmExecutorFee,
                    simulationResult.feeParams.evmExecutorFee,
                );
            }
            if (
                simulationResult.feeParams.isRoundTrip &&
                tvmExecutorFee !== undefined &&
                tvmExecutorFee < simulationResult.feeParams.tvmExecutorFee
            ) {
                throw insufficientFeeParamsError(
                    'tvmExecutorFee',
                    tvmExecutorFee,
                    simulationResult.feeParams.tvmExecutorFee,
                );
            }
        }

        return {
            protocolFee: protocolFee ?? simulationResult.feeParams.protocolFee,
            evmExecutorFee: evmExecutorFee ?? simulationResult.feeParams.evmExecutorFee,
            tvmExecutorFee:
                simulationResult.feeParams.isRoundTrip && tvmExecutorFee !== undefined
                    ? tvmExecutorFee
                    : simulationResult.feeParams.tvmExecutorFee,
            gasLimit: evmProxyMsg.gasLimit ?? simulationResult.feeParams.gasLimit,
            isRoundTrip: isRoundTrip ?? simulationResult.feeParams.isRoundTrip,
            evmEstimatedGas: simulationResult.simulation?.estimatedGas,
        };
    }

    private async prepareCrossChainTransaction(
        evmProxyMsg: EvmProxyMsg,
        sender: SenderAbstraction,
        assets?: Asset[],
        options?: CrossChainTransactionOptions,
        skipAssetsBalanceValidation: boolean = false,
    ): Promise<PreparedCrossChainTransaction> {
        this.logger.debug('Preparing cross-chain transaction');
        const caller = sender.getSenderAddress();
        const {
            allowSimulationError = false,
            isRoundTrip = undefined,
            calculateRollbackFee = true,
            validateAssetsBalance = true,
            evmValidExecutors = [],
            tvmValidExecutors = [],
            evmDataBuilder = buildEvmDataCell,
        } = options || {};

        Validator.validateEVMAddress(evmProxyMsg.evmTargetAddress);
        const aggregatedData = aggregateTokens(assets);

        Validator.validateEVMAddresses(evmValidExecutors);
        Validator.validateTVMAddresses(tvmValidExecutors);

        const shouldValidateAssets = validateAssetsBalance && !skipAssetsBalanceValidation;
        if (shouldValidateAssets) {
            await Promise.all(
                [
                    ...aggregatedData.jettons.map((jetton) => jetton.checkCanBeTransferredBy(caller)),
                    ...aggregatedData.nfts.map((nft) => nft.checkCanBeTransferredBy(caller)),
                    aggregatedData.ton?.checkCanBeTransferredBy(caller),
                ].filter(Boolean),
            );
        }

        const tokensLength = aggregatedData.jettons.length + aggregatedData.nfts.length;
        const transactionLinker = generateTransactionLinker(caller, tokensLength || 1);
        this.logger.debug(`Generated transaction linker: ${formatObjectForLogging(transactionLinker)}`);

        const tacExecutors = evmValidExecutors.length ? evmValidExecutors : this.config.getTrustedTACExecutors;
        const tonExecutors = tvmValidExecutors.length ? tvmValidExecutors : this.config.getTrustedTONExecutors;

        const tx: CrosschainTx = {
            evmProxyMsg,
            assets: assets ?? [],
            options: {
                allowSimulationError,
                isRoundTrip,
                evmValidExecutors: tacExecutors,
                tvmValidExecutors: tonExecutors,
                calculateRollbackFee,
            },
        };

        const feeParams = await this.buildFeeParams(options || {}, evmProxyMsg, sender, tx);
        this.logger.debug(`Resulting fee params: ${formatObjectForLogging(feeParams)}`);

        const validExecutors: ValidExecutors = {
            tac: tacExecutors,
            ton: tonExecutors,
        };
        const evmData = evmDataBuilder(transactionLinker, evmProxyMsg, validExecutors);
        const messages = await this.generateCrossChainMessages(caller, evmData, aggregatedData, feeParams);

        return {
            transaction: {
                validUntil: Date.now() + FIFTEEN_MINUTES,
                messages,
                network: this.config.network,
            },
            transactionLinker,
        };
    }

    private async generateCrossChainMessages(
        caller: string,
        evmData: Cell,
        aggregatedData: { jettons: FT[]; nfts: NFT[]; ton?: TON },
        feeParams: FeeParams,
    ): Promise<ShardMessage[]> {
        this.logger.debug('Generating cross-chain messages');
        const { jettons, nfts, ton = TON.create(this.config) } = aggregatedData;
        const totalAssets = [...jettons, ...nfts];

        let crossChainTonAmount = ton.rawAmount;
        let feeTonAmount = feeParams.protocolFee + feeParams.evmExecutorFee + feeParams.tvmExecutorFee;
        this.logger.debug(`Crosschain ton amount: ${crossChainTonAmount}, Fee ton amount: ${feeTonAmount}`);

        if (!totalAssets.length) {
            const tonNetworkFee = this.simulator.estimateTONFee(ton, {
                excessReceiver: caller,
                evmData,
                feeParams,
            });

            return [
                {
                    address: this.config.TONParams.crossChainLayerAddress,
                    value: crossChainTonAmount + feeTonAmount + tonNetworkFee,
                    payload: await ton.generatePayload({ excessReceiver: caller, evmData, feeParams }),
                    extra: {
                        tonNetworkFee,
                        tacEstimatedGas: feeParams.evmEstimatedGas,
                    },
                },
            ];
        }

        const messages: ShardMessage[] = [];
        let currentFeeParams: FeeParams | undefined = feeParams;

        for (const asset of totalAssets) {
            const params: GeneratePayloadParams = {
                excessReceiver: caller,
                evmData,
                crossChainTonAmount,
                forwardFeeTonAmount: feeTonAmount,
                feeParams: currentFeeParams,
            };

            const payload = await asset.generatePayload(params);

            const address = asset instanceof FT ? await asset.getUserWalletAddress(caller) : asset.address;
            const forwardAmount =
                asset instanceof FT ? JETTON_TRANSFER_FORWARD_TON_AMOUNT : NFT_TRANSFER_FORWARD_TON_AMOUNT;

            const tonNetworkFee = this.simulator.estimateTONFee(asset, params);

            messages.push({
                address,
                value: crossChainTonAmount + feeTonAmount + tonNetworkFee + forwardAmount,
                payload,
                extra: {
                    tonNetworkFee,
                    tacEstimatedGas: currentFeeParams?.evmEstimatedGas,
                },
            });

            crossChainTonAmount = 0n;
            feeTonAmount = 0n;
            currentFeeParams = undefined;
        }

        this.logger.debug('Cross-chain messages generated successfully');
        return messages;
    }

    async sendCrossChainTransaction(
        evmProxyMsg: EvmProxyMsg,
        sender: SenderAbstraction,
        tx: CrosschainTx,
    ): Promise<TransactionLinkerWithOperationId> {
        const { transaction, transactionLinker } = await this.prepareCrossChainTransaction(
            evmProxyMsg,
            sender,
            tx.assets,
            tx.options,
        );

        await TON.checkBalance(sender, this.config, [transaction]);
        const shouldWaitForOperationId = tx.options?.waitOperationId ?? true;
        this.logger.debug(`Sending transaction: ${formatObjectForLogging(transactionLinker)}`);

        const sendTransactionResult = await sender.sendShardTransaction(
            transaction,
            this.config.network,
            this.config.TONParams.contractOpener,
        );

        if (!sendTransactionResult.success || sendTransactionResult.error) {
            throw sendCrossChainTransactionFailedError(
                sendTransactionResult.error?.message ?? 'Transaction failed to send',
            );
        }

        if (!shouldWaitForOperationId) {
            return { sendTransactionResult, ...transactionLinker };
        }

        const ensureTxExecuted = tx.options?.ensureTxExecuted ?? true;
        if (ensureTxExecuted && sendTransactionResult.boc) {
            const hash = getNormalizedExtMessageHash(
                loadMessage(Cell.fromBase64(sendTransactionResult.boc).beginParse()),
            );
            this.logger.info(`Tracking transaction tree for hash: ${hash}`);
            await this.config.TONParams.contractOpener.trackTransactionTree(sender.getSenderAddress(), hash);
            this.logger.info(`Transaction tree successful`);
        }

        const waitOperationIdOptions = tx.options?.waitOperationIdOptions ?? {};
        waitOperationIdOptions.successCheck = waitOperationIdOptions.successCheck ?? ((id: string) => !!id);
        waitOperationIdOptions.logger = waitOperationIdOptions.logger ?? this.logger;

        const operationId = await this.resolveOperationId(
            sendTransactionResult.boc,
            transactionLinker,
            waitOperationIdOptions,
        );

        const shouldWaitForFinalization = tx.options?.waitFinalization ?? true;
        if (!shouldWaitForFinalization) {
            return { sendTransactionResult, operationId, ...transactionLinker };
        }

        if (!operationId) {
            throw operationIdRequiredForFinalizationError;
        }

        const finalizationWaitOptions = tx.options?.finalizationWaitOptions ?? {};
        finalizationWaitOptions.successCheck = finalizationWaitOptions.successCheck ?? isFinalProfiling;
        finalizationWaitOptions.logger = finalizationWaitOptions.logger ?? this.logger;
        finalizationWaitOptions.onSuccess =
            finalizationWaitOptions.onSuccess ??
            (async (profilingData: ExecutionStages) => {
                const stage = profilingData.executedInTON;
                if (!stage.exists) {
                    return;
                }

                if (!stage.stageData?.success) {
                    throw executedInTONStageFailedError;
                }

                for (const transaction of stage.stageData?.transactions ?? []) {
                    await this.config.TONParams.contractOpener.trackTransactionTree(
                        this.config.TONParams.crossChainLayerAddress,
                        transaction.hash,
                    );
                }
            });

        await this.operationTracker.getStageProfiling(operationId, finalizationWaitOptions);

        return { sendTransactionResult, operationId, ...transactionLinker };
    }

    private async resolveOperationId(
        boc: string,
        transactionLinker: TransactionLinker,
        waitOperationIdOptions: WaitOptions<string>,
    ): Promise<string | undefined> {
        if (this.config.TONParams.tonIndexer) {
            const operationId = await this.operationTracker
                .getOperationIdByTonTransactionBoc(boc, waitOperationIdOptions)
                .catch((error) => {
                    this.logger.error(`Error while waiting for operation ID by TON transaction BOC: ${error}`);
                    return undefined;
                });
            if (operationId) {
                return operationId;
            }

            this.logger.debug('Operation ID by TON transaction BOC not found; trying transaction linker');
        }
        return this.operationTracker.getOperationId(transactionLinker, waitOperationIdOptions).catch((error) => {
            this.logger.error(`Error while waiting for operation ID by transaction linker: ${error}`);
            return undefined;
        });
    }

    async sendCrossChainTransactions(
        sender: SenderAbstraction,
        txs: BatchCrossChainTx[],
        options?: CrossChainTransactionsOptions,
    ): Promise<TransactionLinkerWithOperationId[]> {
        const caller = sender.getSenderAddress();
        this.logger.debug(`Preparing ${txs.length} cross-chain transactions for ${caller}`);

        const { transactions, transactionLinkers } = await this.prepareBatchTransactions(txs, sender);

        await TON.checkBalance(sender, this.config, transactions);
        this.logger.debug(`Sending transactions: ${formatObjectForLogging(transactionLinkers)}`);

        const results = await sender.sendShardTransactions(
            transactions,
            this.config.network,
            this.config.TONParams.contractOpener,
        );

        for (const result of results) {
            if (!result.success || result.error) {
                throw sendCrossChainTransactionFailedError(result.error?.message ?? 'Transaction failed to send');
            }
        }

        const shouldWaitForOperationIds = options?.waitOperationIds ?? true;
        return shouldWaitForOperationIds
            ? await this.waitForOperationIds(transactionLinkers, caller, options?.waitOperationIdOptions ?? {})
            : transactionLinkers;
    }

    private async prepareBatchTransactions(txs: BatchCrossChainTx[], sender: SenderAbstraction) {
        const caller = sender.getSenderAddress();

        const txsRequiringValidation = txs.filter((tx) => tx.options?.validateAssetsBalance ?? true);
        if (txsRequiringValidation.length) {
            // Aggregate only assets from txs that require validation and validate once per unique asset
            const assetsToValidate: Asset[] = txsRequiringValidation.flatMap((tx) => tx.assets ?? []);
            const aggregatedData = aggregateTokens(assetsToValidate);

            await Promise.all(
                [
                    ...aggregatedData.jettons.map((jetton) => jetton.checkCanBeTransferredBy(caller)),
                    ...aggregatedData.nfts.map((nft) => nft.checkCanBeTransferredBy(caller)),
                    aggregatedData.ton?.checkCanBeTransferredBy(caller),
                ].filter(Boolean),
            );
        }

        const results = await Promise.all(
            txs.map(({ evmProxyMsg, assets, options }) =>
                this.prepareCrossChainTransaction(evmProxyMsg, sender, assets, options, true),
            ),
        );

        return {
            transactions: results.map((r) => r.transaction),
            transactionLinkers: results.map((r) => r.transactionLinker),
        };
    }

    private async waitForOperationIds(
        transactionLinkers: TransactionLinker[],
        caller: string,
        waitOperationIdOptions: WaitOptions<OperationIdsByShardsKey>,
    ): Promise<TransactionLinkerWithOperationId[]> {
        this.logger.debug(`Waiting for operation IDs`);
        try {
            waitOperationIdOptions.successCheck =
                waitOperationIdOptions.successCheck ??
                ((operationIds: OperationIdsByShardsKey) =>
                    Object.keys(operationIds).length == transactionLinkers.length &&
                    Object.values(operationIds).every((ids) => ids.operationIds.length > 0));
            waitOperationIdOptions.logger = waitOperationIdOptions.logger ?? this.logger;

            const operationIds = await this.operationTracker.getOperationIdsByShardsKeys(
                transactionLinkers.map((linker) => linker.shardsKey),
                caller,
                waitOperationIdOptions,
            );

            this.logger.debug(`Operation IDs: ${formatObjectForLogging(operationIds)}`);
            return transactionLinkers.map((linker) => ({
                ...linker,
                operationId: operationIds[linker.shardsKey].operationIds[0],
            }));
        } catch (error) {
            this.logger.error(`Error while waiting for operation IDs: ${error}`);
            return transactionLinkers;
        }
    }

    async prepareCrossChainTransactionPayload(
        evmProxyMsg: EvmProxyMsg,
        senderAddress: string,
        assets: Asset[] = [],
        options?: CrossChainTransactionOptions,
    ): Promise<CrossChainPayloadResult[]> {
        this.logger.debug('Preparing cross-chain transaction payload');

        const mockSender = getMockSender(senderAddress);

        const result = await this.prepareCrossChainTransaction(evmProxyMsg, mockSender, assets, options, true);

        return result.transaction.messages.map((r) => ({
            body: r.payload,
            destinationAddress: r.address,
            tonAmount: r.value,
            tonNetworkFee: r.extra.tonNetworkFee,
            tacEstimatedGas: r.extra.tacEstimatedGas,
            transactionLinker: result.transactionLinker,
        }));
    }
}
