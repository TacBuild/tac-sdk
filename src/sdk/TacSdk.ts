import { Wallet } from 'ethers';

import { AssetFactory, FT, NFT } from '../assets';
import {
    Asset,
    IConfiguration,
    ILogger,
    IOperationTracker,
    ISimulator,
    ITacSDK,
    ITACTransactionManager,
    ITONTransactionManager,
} from '../interfaces';
import type { SenderAbstraction } from '../sender';
import {
    AssetFromFTArg,
    AssetFromNFTCollectionArg,
    AssetFromNFTItemArg,
    AssetLike,
    AssetType,
    CrossChainTransactionOptions,
    CrosschainTx,
    CrosschainTxWithAssetLike,
    EVMAddress,
    EvmProxyMsg,
    ExecutionFeeEstimationResult,
    Network,
    NFTAddressType,
    NFTItemData,
    OperationIdsByShardsKey,
    SDKParams,
    SuggestedTVMExecutorFee,
    TACSimulationParams,
    TACSimulationResult,
    TransactionLinkerWithOperationId,
    TVMAddress,
    UserWalletBalanceExtended,
    WaitOptions,
} from '../structs/Struct';
import { JettonMasterData } from '../wrappers/JettonMaster';
import { Configuration } from './Configuration';
import { DEFAULT_DELAY } from './Consts';
import { NoopLogger } from './Logger';
import { OperationTracker } from './OperationTracker';
import { Simulator } from './Simulator';
import { TACTransactionManager } from './TACTransactionManager';
import { TONTransactionManager } from './TONTransactionManager';
import { getBouncedAddress, mapAssetsToTonAssets,normalizeAssets } from './Utils';
export class TacSdk implements ITacSDK {
    readonly config: IConfiguration;
    readonly operationTracker: IOperationTracker;
    private readonly simulator: ISimulator;
    private readonly tonTransactionManager: ITONTransactionManager;
    private readonly tacTransactionManager: ITACTransactionManager;

    private constructor(
        config: IConfiguration,
        simulator: ISimulator,
        tonTransactionManager: ITONTransactionManager,
        tacTransactionManager: ITACTransactionManager,
        operationTracker: IOperationTracker,
    ) {
        this.config = config;
        this.simulator = simulator;
        this.tonTransactionManager = tonTransactionManager;
        this.tacTransactionManager = tacTransactionManager;
        this.operationTracker = operationTracker;
    }

    static async create(sdkParams: SDKParams, logger: ILogger = new NoopLogger()): Promise<TacSdk> {
        const network = sdkParams.network;
        const delay = sdkParams.delay ?? DEFAULT_DELAY;

        const { dev, testnet, mainnet } = await import('../../artifacts');
        let artifacts;
        if (network === Network.MAINNET) artifacts = mainnet;
        else if (network === Network.TESTNET) artifacts = testnet;
        else if (network === Network.DEV) artifacts = dev;
        else throw new Error(`Unsupported network: ${network}`);

        const config = await Configuration.create(
            network,
            artifacts,
            sdkParams.TONParams,
            sdkParams.TACParams,
            sdkParams.customLiteSequencerEndpoints,
            delay,
        );

        const operationTracker = new OperationTracker(network, config.liteSequencerEndpoints);
        const simulator = new Simulator(config, operationTracker, logger);
        const tonTransactionManager = new TONTransactionManager(config, simulator, operationTracker, logger);
        const tacTransactionManager = new TACTransactionManager(config, operationTracker, logger);

        return new TacSdk(config, simulator, tonTransactionManager, tacTransactionManager, operationTracker);
    }

    closeConnections(): unknown {
        return this.config.closeConnections();
    }

    get nativeTONAddress(): string {
        return this.config.nativeTONAddress;
    }

    async getSmartAccountAddressForTvmWallet(tvmWallet: string, applicationAddress: string): Promise<string> {
        const bouncedAddress = getBouncedAddress(tvmWallet);
        return await this.config.TACParams.smartAccountFactory.getSmartAccountForApplication(
            bouncedAddress,
            applicationAddress,
        );
    }

    async nativeTACAddress(): Promise<string> {
        return this.config.nativeTACAddress();
    }

    get getTrustedTACExecutors(): string[] {
        return this.config.getTrustedTACExecutors;
    }

    get getTrustedTONExecutors(): string[] {
        return this.config.getTrustedTONExecutors;
    }

    async getSimulationInfo(
        evmProxyMsg: EvmProxyMsg,
        sender: SenderAbstraction,
        assets?: AssetLike[],
        options?: CrossChainTransactionOptions,
    ): Promise<ExecutionFeeEstimationResult> {
        const normalizedAssets = await normalizeAssets(this.config, assets);
        const tx: CrosschainTx = { evmProxyMsg, assets: normalizedAssets, options };
        return this.simulator.getSimulationInfo(sender, tx);
    }

    async getTVMExecutorFeeInfo(
        assets: AssetLike[],
        feeSymbol: string,
        tvmValidExecutors?: string[],
    ): Promise<SuggestedTVMExecutorFee> {
        const normalized = await normalizeAssets(this.config, assets);
        const params = {
            tonAssets: mapAssetsToTonAssets(normalized),
            feeSymbol: feeSymbol,
            tvmValidExecutors: tvmValidExecutors ?? [],
        };
        return this.operationTracker.getTVMExecutorFee(params);
    }

    async sendCrossChainTransaction(
        evmProxyMsg: EvmProxyMsg,
        sender: SenderAbstraction,
        assets: AssetLike[] = [],
        options?: CrossChainTransactionOptions,
        waitOptions?: WaitOptions<string>,
    ): Promise<TransactionLinkerWithOperationId> {
        const normalizedAssets = await normalizeAssets(this.config, assets);
        const tx: CrosschainTx = { evmProxyMsg, assets: normalizedAssets, options };
        return this.tonTransactionManager.sendCrossChainTransaction(evmProxyMsg, sender, tx, waitOptions);
    }

    async sendCrossChainTransactions(
        sender: SenderAbstraction,
        txs: CrosschainTxWithAssetLike[],
        waitOptions?: WaitOptions<OperationIdsByShardsKey>,
    ): Promise<TransactionLinkerWithOperationId[]> {
        const normalizedTxs: CrosschainTx[] = await Promise.all(
            txs.map(async (tx) => ({
                evmProxyMsg: tx.evmProxyMsg,
                options: tx.options,
                assets: await normalizeAssets(this.config, tx.assets),
            })),
        );
        return this.tonTransactionManager.sendCrossChainTransactions(sender, normalizedTxs, waitOptions);
    }

    async bridgeTokensToTON(
        signer: Wallet,
        value: bigint,
        tonTarget: string,
        assets?: AssetLike[],
        tvmExecutorFee?: bigint,
        tvmValidExecutors?: string[],
    ): Promise<string> {
        const normalizedAssets = await normalizeAssets(this.config, assets);
        return this.tacTransactionManager.bridgeTokensToTON(
            signer,
            value,
            tonTarget,
            normalizedAssets,
            tvmExecutorFee,
            tvmValidExecutors,
        );
    }

    async isContractDeployedOnTVM(address: string): Promise<boolean> {
        return this.config.isContractDeployedOnTVM(address);
    }

    async simulateTACMessage(req: TACSimulationParams): Promise<TACSimulationResult> {
        return this.operationTracker.simulateTACMessage(req);
    }

    async simulateTransactions(sender: SenderAbstraction, txs: CrosschainTx[]): Promise<ExecutionFeeEstimationResult[]> {
        return this.simulator.getSimulationsInfo(sender, txs);
    }

    // Asset methods
    async getAsset(args: AssetFromFTArg): Promise<FT>;
    async getAsset(args: AssetFromNFTCollectionArg): Promise<NFT>;
    async getAsset(args: AssetFromNFTItemArg): Promise<NFT>;
    async getAsset(args: AssetFromFTArg | AssetFromNFTCollectionArg | AssetFromNFTItemArg): Promise<Asset> {
        return await AssetFactory.from(this.config, args);
    }

    // Jetton methods
    async getUserJettonWalletAddress(userAddress: string, tokenAddress: string): Promise<string> {
        const ft = await AssetFactory.from(this.config, {
            address: tokenAddress,
            tokenType: AssetType.FT,
        });
        return (ft as FT).getUserWalletAddress(userAddress);
    }

    async getUserJettonBalance(userAddress: string, tokenAddress: string): Promise<bigint> {
        const ft = await AssetFactory.from(this.config, {
            address: tokenAddress,
            tokenType: AssetType.FT,
        });
        return (ft as FT).getUserBalance(userAddress);
    }

    async getUserJettonBalanceExtended(userAddress: string, tokenAddress: string): Promise<UserWalletBalanceExtended> {
        const ft = await AssetFactory.from(this.config, {
            address: tokenAddress,
            tokenType: AssetType.FT,
        });
        return (ft as FT).getUserBalanceExtended(userAddress);
    }

    async getJettonData(itemAddress: TVMAddress): Promise<JettonMasterData> {
        return FT.getJettonData(this.config.TONParams.contractOpener, itemAddress);
    }

    public async getFT(address: TVMAddress | EVMAddress): Promise<FT> {
        return await FT.fromAddress(this.config, address);
    }

    // NFT methods
    async getNFTItemData(itemAddress: TVMAddress): Promise<NFTItemData> {
        return NFT.getItemData(this.config, itemAddress);
    }

    async getNFT(args: AssetFromNFTCollectionArg | AssetFromNFTItemArg): Promise<NFT> {
        if ('addressType' in args && args.addressType === NFTAddressType.ITEM) {
            return NFT.fromItem(this.config, args.address as TVMAddress);
        } else {
            const collectionArgs = args as AssetFromNFTCollectionArg;
            return NFT.fromCollection(this.config, {
                collection: collectionArgs.address,
                index: collectionArgs.index,
            });
        }
    }

    // Address conversion methods
    async getEVMTokenAddress(tvmTokenAddress: string): Promise<string> {
        const asset = await AssetFactory.from(this.config, {
            address: tvmTokenAddress,
            tokenType: AssetType.FT,
        });
        return asset.getEVMAddress();
    }

    async getTVMTokenAddress(evmTokenAddress: string): Promise<string> {
        return FT.getTVMAddress(this.config, evmTokenAddress);
    }

    async getTVMNFTAddress(evmNFTAddress: string, tokenId?: number | bigint): Promise<string> {
        return NFT.getTVMAddress(this.config, evmNFTAddress, tokenId === undefined ? undefined : BigInt(tokenId));
    }

    async getEVMNFTAddress(tvmNFTAddress: string, addressType: NFTAddressType): Promise<string> {
        if (addressType === NFTAddressType.ITEM) {
            const nft = await NFT.fromItem(this.config, tvmNFTAddress);
            return nft.getEVMAddress();
        } else {
            const nftCollection = await NFT.fromCollection(this.config, { collection: tvmNFTAddress, index: 0n });
            return nftCollection.getEVMAddress();
        }
    }

    getOperationTracker(): IOperationTracker {
        return this.operationTracker;
    }
}
