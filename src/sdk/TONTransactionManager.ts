import { Cell } from '@ton/ton';

import { FT, NFT, TON } from '../assets';
import { missingFeeParamsError, missingGasLimitError, missingTvmExecutorFeeError } from '../errors';
import { sendCrossChainTransactionFailedError } from '../errors/instances';
import { Asset, IConfiguration, ILogger, IOperationTracker, ISimulator, ITONTransactionManager } from '../interfaces';
import type { SenderAbstraction } from '../sender';
import { ShardMessage, ShardTransaction } from '../structs/InternalStruct';
import {
    BatchCrossChainTx,
    CrossChainTransactionOptions,
    CrossChainTransactionsOptions,
    CrosschainTx,
    EvmProxyMsg,
    FeeParams,
    OperationIdsByShardsKey,
    TransactionLinker,
    TransactionLinkerWithOperationId,
    ValidExecutors,
    WaitOptions,
} from '../structs/Struct';
import { FIFTEEN_MINUTES, TRANSACTION_TON_AMOUNT } from './Consts';
import { NoopLogger } from './Logger';
import { aggregateTokens, buildEvmDataCell, formatObjectForLogging, generateTransactionLinker } from './Utils';
import { Validator } from './Validator';

export class TONTransactionManager implements ITONTransactionManager {
    constructor(
        private readonly config: IConfiguration,
        private readonly simulator: ISimulator,
        private readonly operationTracker: IOperationTracker,
        private readonly logger: ILogger = new NoopLogger(),
    ) {}

    private async buildFeeParams(
        options: CrossChainTransactionOptions,
        evmProxyMsg: EvmProxyMsg,
        sender: SenderAbstraction,
        tx: CrosschainTx,
    ): Promise<FeeParams> {
        const { withoutSimulation, protocolFee, evmExecutorFee, tvmExecutorFee, isRoundTrip } = options;

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

        return {
            protocolFee: protocolFee ?? simulationResult.feeParams.protocolFee,
            evmExecutorFee: evmExecutorFee ?? simulationResult.feeParams.evmExecutorFee,
            tvmExecutorFee:
                simulationResult.feeParams.isRoundTrip && tvmExecutorFee !== undefined
                    ? tvmExecutorFee
                    : simulationResult.feeParams.tvmExecutorFee,
            gasLimit: evmProxyMsg.gasLimit ?? simulationResult.feeParams.gasLimit,
            isRoundTrip: isRoundTrip ?? simulationResult.feeParams.isRoundTrip,
        };
    }

    private async prepareCrossChainTransaction(
        evmProxyMsg: EvmProxyMsg,
        sender: SenderAbstraction,
        assets?: Asset[],
        options?: CrossChainTransactionOptions,
        skipAssetsBalanceValidation: boolean = false,
    ): Promise<{ transaction: ShardTransaction; transactionLinker: TransactionLinker }> {
        this.logger.debug('Preparing cross-chain transaction');
        const caller = sender.getSenderAddress();
        const {
            allowSimulationError = false,
            isRoundTrip = undefined,
            calculateRollbackFee = true,
            validateAssetsBalance = true,
        } = options || {};
        const { evmValidExecutors = [], tvmValidExecutors = [] } = options || {};

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
        const evmData = buildEvmDataCell(transactionLinker, evmProxyMsg, validExecutors);
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
            return [
                {
                    address: this.config.TONParams.crossChainLayerAddress,
                    value: crossChainTonAmount + feeTonAmount + TRANSACTION_TON_AMOUNT,
                    payload: await ton.generatePayload({ excessReceiver: caller, evmData, feeParams }),
                },
            ];
        }

        const messages: ShardMessage[] = [];
        let currentFeeParams: FeeParams | undefined = feeParams;

        for (const asset of totalAssets) {
            const payload = await asset.generatePayload({
                excessReceiver: caller,
                evmData,
                crossChainTonAmount,
                forwardFeeTonAmount: feeTonAmount,
                feeParams: currentFeeParams,
            });

            const address = asset instanceof FT ? await asset.getUserWalletAddress(caller) : asset.address;

            messages.push({
                address,
                value: crossChainTonAmount + feeTonAmount + TRANSACTION_TON_AMOUNT,
                payload,
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

        const shouldWaitForOperationId = tx.options?.waitOperationId ?? true;

        if (!shouldWaitForOperationId) {
            return { sendTransactionResult, ...transactionLinker };
        }

        const waitOptions = tx.options?.waitOptions ?? {};
        waitOptions.successCheck = waitOptions.successCheck ?? ((id: string) => !!id);
        waitOptions.logger = waitOptions.logger ?? this.logger;

        const operationId = await this.operationTracker
            .getOperationId(transactionLinker, waitOptions)
            .catch((error) => {
                this.logger.error(`Error while waiting for operation ID: ${error}`);
                return undefined;
            });

        return { sendTransactionResult, operationId, ...transactionLinker };
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
            ? await this.waitForOperationIds(transactionLinkers, caller, options?.waitOptions ?? {})
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
        waitOptions: WaitOptions<OperationIdsByShardsKey>,
    ): Promise<TransactionLinkerWithOperationId[]> {
        this.logger.debug(`Waiting for operation IDs`);
        try {
            waitOptions.successCheck =
                waitOptions.successCheck ??
                ((operationIds: OperationIdsByShardsKey) =>
                    Object.keys(operationIds).length == transactionLinkers.length &&
                    Object.values(operationIds).every((ids) => ids.operationIds.length > 0));
            waitOptions.logger = waitOptions.logger ?? this.logger;

            const operationIds = await this.operationTracker.getOperationIdsByShardsKeys(
                transactionLinkers.map((linker) => linker.shardsKey),
                caller,
                waitOptions,
            );

            this.logger.debug(`Operation IDs: ${formatObjectForLogging(operationIds)}`);
            return transactionLinkers.map((linker) => ({
                ...linker,
                operationId: operationIds[linker.shardsKey].operationIds.at(0),
            }));
        } catch (error) {
            this.logger.error(`Error while waiting for operation IDs: ${error}`);
            return transactionLinkers;
        }
    }
}
