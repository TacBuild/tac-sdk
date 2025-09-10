import { Cell } from '@ton/ton';
import { Wallet } from 'ethers';

import { AssetFactory, FT, NFT, TON } from '../assets';
import { Asset, IConfiguration, ILogger, IOperationTracker, ISimulator, ITransactionManager } from '../interfaces';
import type { SenderAbstraction } from '../sender';
import { ShardMessage, ShardTransaction } from '../structs/InternalStruct';
import {
    AssetType,
    CrossChainTransactionOptions,
    CrosschainTx,
    EvmProxyMsg,
    FeeParams,
    OperationIdsByShardsKey,
    TransactionLinker,
    TransactionLinkerWithOperationId,
    ValidExecutors,
    WaitOptions,
} from '../structs/Struct';
import { TAC_SYMBOL, TRANSACTION_TON_AMOUNT } from './Consts';
import { NoopLogger } from './Logger';
import { aggregateTokens, buildEvmDataCell, formatObjectForLogging, generateTransactionLinker } from './Utils';
import { Validator } from './Validator';

export class TransactionManager implements ITransactionManager {
    private readonly config: IConfiguration;
    private readonly simulator: ISimulator;
    private readonly operationTracker: IOperationTracker;
    private readonly logger: ILogger;

    private readonly evmDataCellBuilder: (
        transactionLinker: TransactionLinker,
        evmProxyMsg: EvmProxyMsg,
        validExecutors: ValidExecutors,
    ) => Cell;

    constructor(
        config: IConfiguration,
        simulator: ISimulator,
        operationTracker: IOperationTracker,
        logger: ILogger = new NoopLogger(),
        options?: {
            evmDataCellBuilder?: (
                transactionLinker: TransactionLinker,
                evmProxyMsg: EvmProxyMsg,
                validExecutors: ValidExecutors,
            ) => Cell;
        },
    ) {
        this.config = config;
        this.simulator = simulator;
        this.operationTracker = operationTracker;
        this.logger = logger;
        this.evmDataCellBuilder = options?.evmDataCellBuilder ?? buildEvmDataCell;
    }

    private async prepareCrossChainTransaction(
        evmProxyMsg: EvmProxyMsg,
        caller: string,
        assets?: Asset[],
        options?: CrossChainTransactionOptions,
    ): Promise<{ transaction: ShardTransaction; transactionLinker: TransactionLinker }> {
        this.logger.debug('Preparing cross-chain transaction');
        const {
            allowSimulationError = false,
            isRoundTrip = undefined,
            protocolFee = undefined,
            evmExecutorFee = undefined,
            tvmExecutorFee = undefined,
            calculateRollbackFee = true,
        } = options || {};
        let { evmValidExecutors = [], tvmValidExecutors = [] } = options || {};

        Validator.validateEVMAddress(evmProxyMsg.evmTargetAddress);
        Validator.validateEVMAddresses(options?.evmValidExecutors);
        Validator.validateTVMAddresses(options?.tvmValidExecutors);

        const aggregatedData = await aggregateTokens(assets);
        await Promise.all(aggregatedData.jettons.map((jetton) => jetton.checkCanBeTransferredBy(caller)));
        await Promise.all(aggregatedData.nfts.map((nft) => nft.checkCanBeTransferredBy(caller)));
        await aggregatedData.ton?.checkCanBeTransferredBy(caller);

        const tokensLength = aggregatedData.jettons.length + aggregatedData.nfts.length;
        this.logger.debug(`Tokens length: ${tokensLength}`);
        const transactionLinkerShardCount = tokensLength == 0 ? 1 : tokensLength;
        this.logger.debug(`Transaction linker shard count: ${transactionLinkerShardCount}`);

        const transactionLinker = generateTransactionLinker(caller, transactionLinkerShardCount);
        this.logger.debug(`Generated transaction linker: ${formatObjectForLogging(transactionLinker)}`);

        if (evmValidExecutors.length == 0) {
            evmValidExecutors = this.config.getTrustedTACExecutors;
        }

        if (tvmValidExecutors.length == 0) {
            tvmValidExecutors = this.config.getTrustedTONExecutors;
        }

        const { feeParams } = await this.simulator.getSimulationInfoForTransaction(
            evmProxyMsg,
            transactionLinker,
            assets ?? [],
            allowSimulationError,
            isRoundTrip,
            evmValidExecutors,
            tvmValidExecutors,
            calculateRollbackFee,
        );

        if (evmProxyMsg.gasLimit == undefined) {
            evmProxyMsg.gasLimit = feeParams.gasLimit;
        }

        if (evmExecutorFee != undefined) {
            feeParams.evmExecutorFee = evmExecutorFee;
        }

        if (feeParams.isRoundTrip && tvmExecutorFee != undefined) {
            feeParams.tvmExecutorFee = tvmExecutorFee;
        }

        if (protocolFee != undefined) {
            feeParams.protocolFee = protocolFee;
        }
        this.logger.debug(`Resulting fee params: ${formatObjectForLogging(feeParams)}`);

        const validExecutors: ValidExecutors = {
            tac: evmValidExecutors,
            ton: tvmValidExecutors,
        };
        this.logger.debug(`Valid executors: ${formatObjectForLogging(validExecutors)}`);

        const evmData = this.evmDataCellBuilder(transactionLinker, evmProxyMsg, validExecutors);
        const messages = await this.generateCrossChainMessages(caller, evmData, aggregatedData, feeParams);

        const transaction: ShardTransaction = {
            validUntil: +new Date() + 15 * 60 * 1000,
            messages,
            network: this.config.network,
        };

        this.logger.debug('Transaction prepared');
        return { transaction, transactionLinker };
    }

    private async generateCrossChainMessages(
        caller: string,
        evmData: Cell,
        aggregatedData: {
            jettons: FT[];
            nfts: NFT[];
            ton?: TON;
        },
        feeParams: FeeParams,
    ): Promise<ShardMessage[]> {
        this.logger.debug(`Generating cross-chain messages`);
        const { jettons, nfts, ton = TON.create(this.config) } = aggregatedData;
        let crossChainTonAmount = ton.rawAmount;
        let feeTonAmount = feeParams.protocolFee + feeParams.evmExecutorFee + feeParams.tvmExecutorFee;
        this.logger.debug(`Crosschain ton amount: ${crossChainTonAmount}`);
        this.logger.debug(`Fee ton amount: ${feeTonAmount}`);

        if (jettons.length == 0 && nfts.length == 0) {
            return [
                {
                    address: this.config.TONParams.crossChainLayerAddress,
                    value: crossChainTonAmount + feeTonAmount + TRANSACTION_TON_AMOUNT,
                    payload: await ton.generatePayload({
                        excessReceiver: caller,
                        evmData,
                        feeParams,
                    }),
                },
            ];
        }

        const messages: ShardMessage[] = [];

        let currentFeeParams: FeeParams | undefined = feeParams;
        for (const jetton of aggregatedData.jettons) {
            const payload = await jetton.generatePayload({
                excessReceiver: caller,
                evmData,
                crossChainTonAmount,
                forwardFeeTonAmount: feeTonAmount,
                feeParams: currentFeeParams,
            });
            const jettonWalletAddress = await jetton.getUserWalletAddress(caller);
            messages.push({
                address: jettonWalletAddress,
                value: crossChainTonAmount + feeTonAmount + TRANSACTION_TON_AMOUNT,
                payload,
            });

            crossChainTonAmount = 0n;
            feeTonAmount = 0n;
            currentFeeParams = undefined;
        }
        for (const nft of aggregatedData.nfts) {
            const payload = await nft.generatePayload({
                excessReceiver: caller,
                evmData,
                crossChainTonAmount,
                forwardFeeTonAmount: feeTonAmount,
                feeParams: currentFeeParams,
            });
            messages.push({
                address: nft.address,
                value: crossChainTonAmount + feeTonAmount + TRANSACTION_TON_AMOUNT,
                payload,
            });

            crossChainTonAmount = 0n;
            feeTonAmount = 0n;
            currentFeeParams = undefined;
        }

        this.logger.debug('Generating cross-chain messages success');
        return messages;
    }

    async sendCrossChainTransaction(
        evmProxyMsg: EvmProxyMsg,
        sender: SenderAbstraction,
        assets?: Asset[],
        options?: CrossChainTransactionOptions,
        waitOptions?: WaitOptions<string>,
    ): Promise<TransactionLinkerWithOperationId> {
        const caller = sender.getSenderAddress();
        this.logger.debug(`Caller: ${caller}`);

        const { transaction, transactionLinker } = await this.prepareCrossChainTransaction(
            evmProxyMsg,
            caller,
            assets,
            options,
        );

        await TON.checkBalance(sender, this.config, [transaction]);

        this.logger.debug(`*****Sending transaction: ${formatObjectForLogging(transaction)}`);
        const sendTransactionResult = await sender.sendShardTransaction(
            transaction,
            this.config.network,
            this.config.TONParams.contractOpener,
        );

        return waitOptions
            ? {
                  sendTransactionResult,
                  operationId: await this.operationTracker
                      .getOperationId(transactionLinker, {
                          ...waitOptions,
                          successCheck: (operationId: string) => !!operationId,
                          logger: this.logger,
                      })
                      .catch((error) => {
                          this.logger.error(`Error while waiting for operation ID: ${error}`);
                          return undefined;
                      }),
                  ...transactionLinker,
              }
            : { sendTransactionResult, ...transactionLinker };
    }

    async sendCrossChainTransactions(
        sender: SenderAbstraction,
        txs: CrosschainTx[],
        waitOptions?: WaitOptions<OperationIdsByShardsKey>,
    ): Promise<TransactionLinkerWithOperationId[]> {
        const caller = sender.getSenderAddress();
        this.logger.debug(`Caller: ${caller}`);
        this.logger.debug('Preparing multiple cross-chain transactions');

        const { transactions, transactionLinkers } = await this.prepareCrossChainTransactions(txs, caller);

        await TON.checkBalance(sender, this.config, transactions);

        this.logger.debug(`*****Sending transactions: ${formatObjectForLogging(transactions)}`);
        await sender.sendShardTransactions(transactions, this.config.network, this.config.TONParams.contractOpener);

        if (!waitOptions) {
            return transactionLinkers;
        }

        return await this.waitForOperationIds(transactionLinkers, caller, waitOptions);
    }

    private async prepareCrossChainTransactions(txs: CrosschainTx[], caller: string) {
        const transactions: ShardTransaction[] = [];
        const transactionLinkers: TransactionLinker[] = [];

        for (const { options, assets, evmProxyMsg } of txs) {
            const { transaction, transactionLinker } = await this.prepareCrossChainTransaction(
                evmProxyMsg,
                caller,
                assets,
                options,
            );
            transactions.push(transaction);
            transactionLinkers.push(transactionLinker);
        }

        return { transactions, transactionLinkers };
    }

    private async waitForOperationIds(
        transactionLinkers: TransactionLinker[],
        caller: string,
        waitOptions: WaitOptions<OperationIdsByShardsKey>,
    ): Promise<TransactionLinkerWithOperationId[]> {
        this.logger.debug(`Waiting for operation IDs`);
        try {
            const operationIds = await this.operationTracker.getOperationIdsByShardsKeys(
                transactionLinkers.map((linker) => linker.shardsKey),
                caller,
                {
                    ...waitOptions,
                    logger: this.logger,
                    successCheck: (operationIds: OperationIdsByShardsKey) =>
                        Object.keys(operationIds).length == transactionLinkers.length &&
                        Object.values(operationIds).every((ids) => ids.operationIds.length > 0),
                },
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

    async bridgeTokensToTON(
        signer: Wallet,
        value: bigint,
        tonTarget: string,
        assets?: Asset[],
        tvmExecutorFee?: bigint,
        tvmValidExecutors?: string[],
    ): Promise<string> {
        this.logger.debug('Bridging tokens to TON');

        if (assets == undefined) {
            assets = [];
        }

        const tonAssets = [...assets];
        if (value > 0n) {
            tonAssets.push(
                await (
                    await AssetFactory.from(this.config, {
                        address: await this.config.nativeTACAddress(),
                        tokenType: AssetType.FT,
                    })
                ).withAmount({ rawAmount: value }),
            );
        }

        Validator.validateTVMAddress(tonTarget);

        if (tvmExecutorFee == undefined) {
            const suggestedTONExecutorFee = await this.simulator.getTVMExecutorFeeInfo(
                tonAssets,
                TAC_SYMBOL,
                tvmValidExecutors,
            );
            this.logger.debug(`Suggested TON executor fee: ${formatObjectForLogging(suggestedTONExecutorFee)}`);
            tvmExecutorFee = BigInt(suggestedTONExecutorFee.inTAC);
        }

        const crossChainLayerAddress = await this.config.TACParams.crossChainLayer.getAddress();
        for (const asset of assets) {
            const evmAddress = await asset.getEVMAddress();
            if (asset.type == AssetType.FT) {
                this.logger.debug(`Approving token ${evmAddress} for ${crossChainLayerAddress}`);
                const tokenContract = this.config.artifacts.tac.wrappers.ERC20FactoryTAC.connect(
                    evmAddress,
                    this.config.TACParams.provider,
                );

                const tx = await tokenContract.connect(signer).approve(crossChainLayerAddress, asset.rawAmount);
                await tx.wait();
                this.logger.debug(`Approved ${evmAddress} for ${crossChainLayerAddress}`);
            }
            if (asset.type == AssetType.NFT) {
                this.logger.debug(`Approving collection ${evmAddress} for ${crossChainLayerAddress}`);
                const tokenContract = this.config.artifacts.tac.wrappers.ERC721FactoryTAC.connect(
                    evmAddress,
                    this.config.TACParams.provider,
                );
                const tx = await tokenContract
                    .connect(signer)
                    .approve(crossChainLayerAddress, (asset as NFT).addresses.index);
                await tx.wait();
                this.logger.debug(`Approved ${asset.address} for ${crossChainLayerAddress}`);
            }
        }

        const shardsKey = BigInt(Math.round(Math.random() * 1e18));
        this.logger.debug(`Shards key: ${shardsKey}`);

        const protocolFee = await this.config.TACParams.crossChainLayer.getProtocolFee();
        this.logger.debug(`Protocol fee: ${protocolFee}`);

        const outMessage = {
            shardsKey: shardsKey,
            tvmTarget: tonTarget,
            tvmPayload: '',
            tvmProtocolFee: protocolFee,
            tvmExecutorFee: tvmExecutorFee,
            tvmValidExecutors: this.config.getTrustedTONExecutors,
            toBridge: await Promise.all(
                assets
                    .filter((asset) => asset.type === AssetType.FT)
                    .map(async (asset) => ({
                        evmAddress: await asset.getEVMAddress(),
                        amount: asset.rawAmount,
                    })),
            ),
            toBridgeNFT: await Promise.all(
                assets
                    .filter((asset) => asset.type === AssetType.NFT)
                    .map(async (asset) => ({
                        evmAddress: await asset.getEVMAddress(),
                        amount: 1n,
                        tokenId: (asset as NFT).addresses.index,
                    })),
            ),
        };

        const encodedOutMessage = this.config.artifacts.tac.utils.encodeOutMessageV1(outMessage);
        const outMsgVersion = 1n;

        const totalValue = value + BigInt(outMessage.tvmProtocolFee) + BigInt(outMessage.tvmExecutorFee);
        this.logger.debug(`Total value: ${totalValue}`);

        const tx = await this.config.TACParams.crossChainLayer
            .connect(signer)
            .sendMessage(outMsgVersion, encodedOutMessage, { value: totalValue });
        await tx.wait();
        this.logger.debug(`Transaction hash: ${tx.hash}`);
        return tx.hash;
    }
}
