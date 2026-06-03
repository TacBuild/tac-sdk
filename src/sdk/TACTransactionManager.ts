import { ethers, Wallet } from 'ethers';

import { IERC20WithDecimals, IERC721 } from '../../artifacts/tacTypes';
import { AssetFactory, NFT } from '../assets';
import {
    blockGasLimitFetchError,
    estimatedGasExceedsBlockGasLimitError,
    executedInTONStageFailedError,
    gasPriceFetchError,
    insufficientBalanceError,
    operationIdRequiredForFinalizationError,
} from '../errors';
import { Asset, IConfiguration, ILogger, IOperationTracker, ITACTransactionManager } from '../interfaces';
import { PreparedBridgeTokensToTON } from '../structs/InternalStruct';
import {
    AssetType,
    BlockchainType,
    CrossChainTransactionToTONOptions,
    ExecutionStages,
    Origin,
    TACCrossChainTransactionResult,
} from '../structs/Struct';
import {
    CROSS_CHAIN_MESSAGE_VERSION_V1,
    DEFAULT_EIP1559_PRIORITY_FEE,
    NFT_BRIDGE_AMOUNT,
    SHARDS_KEY_RANDOM_RANGE,
    TAC_SYMBOL,
} from './Consts';
import { NoopLogger } from './Logger';
import { formatObjectForLogging, isFinalProfiling, mapAssetsToTonAssets } from './Utils';
import { Validator } from './Validator';

export class TACTransactionManager implements ITACTransactionManager {
    constructor(
        private readonly config: IConfiguration,
        private readonly operationTracker: IOperationTracker,
        private readonly logger: ILogger = new NoopLogger(),
    ) {}

    private async prepareBridgeTokensToTON(
        value: bigint,
        tonTarget: string,
        assets: Asset[] = [],
        tvmExecutorFee?: bigint,
        tvmValidExecutors?: string[],
    ): Promise<PreparedBridgeTokensToTON> {
        Validator.validateTVMAddress(tonTarget);
        Validator.validateTVMAddresses(tvmValidExecutors);

        const validExecutors = tvmValidExecutors?.length ? tvmValidExecutors : this.config.getTrustedTONExecutors;
        const tonAssets = [...assets];

        if (value > 0n) {
            tonAssets.push(
                (
                    await AssetFactory.from(this.config, {
                        address: await this.config.nativeTACAddress(),
                        tokenType: AssetType.FT,
                    })
                ).withRawAmount(value),
            );
        }

        if (!tvmExecutorFee) {
            const feeParams = {
                tonAssets: mapAssetsToTonAssets(tonAssets),
                feeSymbol: TAC_SYMBOL,
                tvmValidExecutors: validExecutors,
            };

            const suggestedFee = await this.operationTracker.getTVMExecutorFee(feeParams, null);
            this.logger.debug(`Suggested TON executor fee: ${formatObjectForLogging(suggestedFee)}`);
            tvmExecutorFee = BigInt(suggestedFee.inTAC);
        }

        const protocolFee = await this.config.TACParams.crossChainLayer.getProtocolFee();
        const shardsKey = BigInt(Math.round(Math.random() * SHARDS_KEY_RANDOM_RANGE));

        this.logger.debug(`Shards key: ${shardsKey}, Protocol fee: ${protocolFee}`);

        const [toBridge, toBridgeNFT] = await Promise.all([
            Promise.all(
                assets
                    .filter((a) => a.type === AssetType.FT)
                    .map(async (a) => ({
                        evmAddress: await a.getEVMAddress(),
                        amount: a.rawAmount,
                    })),
            ),
            Promise.all(
                assets
                    .filter((a) => a.type === AssetType.NFT)
                    .map(async (a) => ({
                        evmAddress: await a.getEVMAddress(),
                        amount: NFT_BRIDGE_AMOUNT,
                        tokenId: (a as NFT).addresses.index,
                    })),
            ),
        ]);

        const outMessage = {
            shardsKey,
            tvmTarget: tonTarget,
            tvmPayload: '',
            tvmProtocolFee: protocolFee,
            tvmExecutorFee,
            tvmValidExecutors: validExecutors,
            toBridge,
            toBridgeNFT,
        };

        return {
            outMessagePayload: this.config.artifacts.tac.utils.encodeOutMessageV1(outMessage),
            totalValue: value + BigInt(outMessage.tvmProtocolFee) + BigInt(outMessage.tvmExecutorFee),
        };
    }

    private async approveAsset(
        asset: Asset,
        signer: Wallet,
        spenderAddress: string,
        transactionParams: ethers.Overrides = {},
    ): Promise<void> {
        const evmAddress = await asset.getEVMAddress();
        const hasTransactionParams = Object.keys(transactionParams).length > 0;

        if (asset.type === AssetType.FT) {
            this.logger.debug(`Approving FT ${evmAddress} for ${spenderAddress}`);
            const contract = new ethers.Contract(
                evmAddress,
                this.config.artifacts.tac.compilationArtifacts.IERC20WithDecimals.abi,
                this.config.TACParams.provider,
            ) as unknown as IERC20WithDecimals;
            const tx = hasTransactionParams
                ? await contract.connect(signer).approve(spenderAddress, asset.rawAmount, transactionParams)
                : await contract.connect(signer).approve(spenderAddress, asset.rawAmount);
            await tx.wait();
        } else {
            this.logger.debug(`Approving NFT ${evmAddress} for ${spenderAddress}`);
            const contract = new ethers.Contract(
                evmAddress,
                this.config.artifacts.tac.compilationArtifacts.IERC721.abi,
                this.config.TACParams.provider,
            ) as unknown as IERC721;
            const tx = hasTransactionParams
                ? await contract
                      .connect(signer)
                      .approve(spenderAddress, (asset as NFT).addresses.index, transactionParams)
                : await contract.connect(signer).approve(spenderAddress, (asset as NFT).addresses.index);
            await tx.wait();
        }

        this.logger.debug(`Approved ${evmAddress} for ${spenderAddress}`);
    }

    private async estimateApprovalGas(
        asset: Asset,
        signer: Wallet,
        spenderAddress: string,
        transactionParams: ethers.Overrides = {},
    ): Promise<bigint> {
        const evmAddress = await asset.getEVMAddress();

        if (asset.type === AssetType.FT) {
            const contract = new ethers.Contract(
                evmAddress,
                this.config.artifacts.tac.compilationArtifacts.IERC20WithDecimals.abi,
                this.config.TACParams.provider,
            ) as unknown as IERC20WithDecimals;

            return contract.connect(signer).approve.estimateGas(spenderAddress, asset.rawAmount, transactionParams);
        }

        const contract = new ethers.Contract(
            evmAddress,
            this.config.artifacts.tac.compilationArtifacts.IERC721.abi,
            this.config.TACParams.provider,
        ) as unknown as IERC721;

        return contract
            .connect(signer)
            .approve.estimateGas(spenderAddress, (asset as NFT).addresses.index, transactionParams);
    }

    async sendCrossChainTransactionToTON(
        signer: Wallet,
        tonTarget: string,
        assets: Asset[] = [],
        options?: CrossChainTransactionToTONOptions,
    ): Promise<TACCrossChainTransactionResult> {
        const signerAddress = signer.address;
        const nativeTACAsset = await AssetFactory.from(this.config, {
            address: await this.config.nativeTACAddress(),
            tokenType: AssetType.FT,
        });
        let value = 0n;
        const bridgeAssets: Asset[] = [];

        for (const asset of assets) {
            if (
                asset.origin === Origin.TAC &&
                asset.type === AssetType.FT &&
                asset.address === nativeTACAsset.address
            ) {
                value += asset.rawAmount;
                continue;
            }

            bridgeAssets.push(asset);
        }
        const crossChainLayerAddress = await this.config.TACParams.crossChainLayer.getAddress();
        const preparedBridge = await this.prepareBridgeTokensToTON(
            value,
            tonTarget,
            bridgeAssets,
            options?.tvmExecutorFee,
            options?.tvmValidExecutors,
        );
        const feeData = await this.config.TACParams.provider.getFeeData();
        const maxFeePerGas = feeData.maxFeePerGas;

        if (maxFeePerGas === null) {
            throw gasPriceFetchError('TAC provider did not return maxFeePerGas');
        }

        const latestBlock = await this.config.TACParams.provider.getBlock('latest').catch((error) => {
            throw blockGasLimitFetchError('provider failed to return latest block', error);
        });
        const blockGasLimit = latestBlock?.gasLimit;

        if (blockGasLimit === null || blockGasLimit === undefined) {
            throw blockGasLimitFetchError('provider did not return latest block gas limit');
        }

        const transactionParams: ethers.Overrides = {
            maxFeePerGas,
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? DEFAULT_EIP1559_PRIORITY_FEE,
        };
        const shouldValidateAssetsBalance = options?.validateAssetsBalance ?? true;

        if (shouldValidateAssetsBalance) {
            await Promise.all(
                bridgeAssets.map((asset) => asset.checkCanBeTransferredBy(signerAddress, BlockchainType.TAC)),
            );
        }

        let requiredApprovalBalance = 0n;
        const approvalPlans: Array<{ asset: Asset; gasLimit: bigint }> = [];

        for (const asset of bridgeAssets) {
            const estimatedGas = await this.estimateApprovalGas(asset, signer, crossChainLayerAddress, transactionParams);

            if (estimatedGas > blockGasLimit) {
                throw estimatedGasExceedsBlockGasLimitError('approve', estimatedGas, blockGasLimit);
            }

            requiredApprovalBalance += estimatedGas * maxFeePerGas;
            approvalPlans.push({ asset, gasLimit: estimatedGas });
        }

        const approvalBalance = await this.config.TACParams.provider.getBalance(signer.address);
        if (approvalBalance < requiredApprovalBalance) {
            throw insufficientBalanceError(TAC_SYMBOL);
        }

        for (const approval of approvalPlans) {
            await this.approveAsset(approval.asset, signer, crossChainLayerAddress, {
                ...transactionParams,
                gasLimit: approval.gasLimit,
            });
        }

        const sendMessageGas = await this.config.TACParams.crossChainLayer
            .connect(signer)
            .sendMessage.estimateGas(CROSS_CHAIN_MESSAGE_VERSION_V1, preparedBridge.outMessagePayload, {
                ...transactionParams,
                value: preparedBridge.totalValue,
            });
        if (sendMessageGas > blockGasLimit) {
            throw estimatedGasExceedsBlockGasLimitError('sendMessage', sendMessageGas, blockGasLimit);
        }

        const requiredSendMessageBalance = preparedBridge.totalValue + sendMessageGas * maxFeePerGas;
        const sendMessageBalance = await this.config.TACParams.provider.getBalance(signer.address);
        if (sendMessageBalance < requiredSendMessageBalance) {
            throw insufficientBalanceError(TAC_SYMBOL);
        }

        const tx = await this.config.TACParams.crossChainLayer
            .connect(signer)
            .sendMessage(CROSS_CHAIN_MESSAGE_VERSION_V1, preparedBridge.outMessagePayload, {
                ...transactionParams,
                gasLimit: sendMessageGas,
                value: preparedBridge.totalValue,
            });
        await tx.wait();
        this.logger.debug(`Transaction hash: ${tx.hash}`);

        const shouldWaitForOperationId = options?.waitOperationId ?? true;

        if (!shouldWaitForOperationId) {
            return { txHash: tx.hash };
        }

        const waitOperationIdOptions = options?.waitOperationIdOptions ?? {};
        waitOperationIdOptions.successCheck = waitOperationIdOptions.successCheck ?? ((id: string) => !!id);
        waitOperationIdOptions.logger = waitOperationIdOptions.logger ?? this.logger;

        const operationId = await this.operationTracker
            .getOperationIdByTransactionHash(tx.hash, waitOperationIdOptions)
            .catch((error) => {
                this.logger.error(`Error while waiting for operation ID by transaction hash: ${error}`);
                return undefined;
            });

        const shouldWaitForFinalization = options?.waitFinalization ?? true;
        if (!shouldWaitForFinalization) {
            return { txHash: tx.hash, operationId };
        }

        if (!operationId) {
            throw operationIdRequiredForFinalizationError;
        }

        const finalizationWaitOptions = options?.finalizationWaitOptions ?? {};
        finalizationWaitOptions.successCheck = finalizationWaitOptions.successCheck ?? isFinalProfiling;
        finalizationWaitOptions.logger = finalizationWaitOptions.logger ?? this.logger;
        finalizationWaitOptions.onSuccess =
            finalizationWaitOptions.onSuccess ??
            (async (profilingData: ExecutionStages) => {
                if (!profilingData.executedInTON.exists) {
                    return;
                }

                if (!profilingData.executedInTON.stageData?.success) {
                    throw executedInTONStageFailedError;
                }

                for (const transaction of profilingData.executedInTON.stageData?.transactions ?? []) {
                    await this.config.TONParams.contractOpener.trackTransactionTree(
                        this.config.TONParams.crossChainLayerAddress,
                        transaction.hash,
                    );
                }
            });

        await this.operationTracker.getStageProfiling(operationId, finalizationWaitOptions);

        return { txHash: tx.hash, operationId };
    }

    async bridgeTokensToTON(
        signer: Wallet,
        value: bigint,
        tonTarget: string,
        assets: Asset[] = [],
        tvmExecutorFee?: bigint,
        tvmValidExecutors?: string[],
    ): Promise<string> {
        this.logger.debug('Bridging tokens to TON');
        Validator.validateTVMAddress(tonTarget);
        Validator.validateTVMAddresses(tvmValidExecutors);

        const crossChainLayerAddress = await this.config.TACParams.crossChainLayer.getAddress();

        const { outMessagePayload, totalValue } = await this.prepareBridgeTokensToTON(
            value,
            tonTarget,
            assets,
            tvmExecutorFee,
            tvmValidExecutors,
        );
        this.logger.debug(`Total value: ${totalValue}`);

        for (const asset of assets) {
            await this.approveAsset(asset, signer, crossChainLayerAddress);
        }

        const tx = await this.config.TACParams.crossChainLayer
            .connect(signer)
            .sendMessage(CROSS_CHAIN_MESSAGE_VERSION_V1, outMessagePayload, {
                value: totalValue,
            });
        await tx.wait();
        this.logger.debug(`Transaction hash: ${tx.hash}`);

        return tx.hash;
    }
}
