import { Wallet } from 'ethers';

import { AssetFactory, FT, TON, NFT } from '../assets';
import type { SenderAbstraction } from '../sender';
import {
    Asset,
    AssetType,
    CrossChainTransactionOptions,
    CrosschainTx,
    EVMAddress,
    EvmProxyMsg,
    ExecutionFeeEstimationResult,
    Network,
    NFTAddressType,
    NFTItemData,
    OperationIdsByShardsKey,
    SDKParams,
    SuggestedTONExecutorFee,
    TACSimulationRequest,
    TACSimulationResult,
    TransactionLinkerWithOperationId,
    TVMAddress,
    UserWalletBalanceExtended,
    WaitOptions,
    AssetFromFTArg,
    AssetFromNFTCollectionArg,
    AssetFromNFTItemArg,
} from '../structs/Struct';
import { Configuration } from './Configuration';
import { DEFAULT_DELAY } from './Consts';
import { NoopLogger } from './Logger';
import { OperationTracker } from './OperationTracker';
import { Simulator } from './Simulator';
import { TransactionManager } from './TransactionManager';
import { IConfiguration, ILogger, ISimulator, ITacSDK, ITransactionManager } from '../interfaces';
import { JettonMasterData } from '../wrappers/JettonMaster';

export class TacSdk implements ITacSDK {
    readonly config: IConfiguration;
    private readonly simulator: ISimulator;
    private readonly transactionManager: ITransactionManager;

    private constructor(config: IConfiguration, simulator: ISimulator, transactionManager: ITransactionManager) {
        this.config = config;
        this.simulator = simulator;
        this.transactionManager = transactionManager;
    }

    static async create(sdkParams: SDKParams, logger: ILogger = new NoopLogger()): Promise<TacSdk> {
        const network = sdkParams.network;
        const delay = sdkParams.delay ?? DEFAULT_DELAY;

        const { testnet, mainnet } = await import('@tonappchain/artifacts');
        const artifacts = network === Network.TESTNET ? testnet : mainnet;

        const config = await Configuration.create(
            network,
            artifacts,
            sdkParams.TONParams,
            sdkParams.TACParams,
            sdkParams.customLiteSequencerEndpoints,
            delay,
        );

        const simulator = new Simulator(config, logger);
        const operationTracker = new OperationTracker(network, config.liteSequencerEndpoints);
        const transactionManager = new TransactionManager(config, simulator, operationTracker, logger);

        return new TacSdk(config, simulator, transactionManager);
    }

    closeConnections(): unknown {
        return this.config.closeConnections();
    }

    get nativeTONAddress(): string {
        return this.config.nativeTONAddress;
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

    async getTransactionSimulationInfo(
        evmProxyMsg: EvmProxyMsg,
        sender: SenderAbstraction,
        assets?: Asset[],
    ): Promise<ExecutionFeeEstimationResult> {
        return this.simulator.getTransactionSimulationInfo(evmProxyMsg, sender, assets);
    }

    async getTVMExecutorFeeInfo(
        assets: Asset[],
        feeSymbol: string,
        tvmValidExecutors?: string[],
    ): Promise<SuggestedTONExecutorFee> {
        return this.simulator.getTVMExecutorFeeInfo(assets, feeSymbol, tvmValidExecutors);
    }

    async sendCrossChainTransaction(
        evmProxyMsg: EvmProxyMsg,
        sender: SenderAbstraction,
        assets?: Asset[],
        options?: CrossChainTransactionOptions,
        waitOptions?: WaitOptions<string>,
    ): Promise<TransactionLinkerWithOperationId> {
        return this.transactionManager.sendCrossChainTransaction(evmProxyMsg, sender, assets, options, waitOptions);
    }

    async sendCrossChainTransactions(
        sender: SenderAbstraction,
        txs: CrosschainTx[],
        waitOptions?: WaitOptions<OperationIdsByShardsKey>,
    ): Promise<TransactionLinkerWithOperationId[]> {
        return this.transactionManager.sendCrossChainTransactions(sender, txs, waitOptions);
    }

    async bridgeTokensToTON(
        signer: Wallet,
        value: bigint,
        tonTarget: string,
        assets?: Asset[],
        tvmExecutorFee?: bigint,
        tvmValidExecutors?: string[],
    ): Promise<string> {
        return this.transactionManager.bridgeTokensToTON(
            signer,
            value,
            tonTarget,
            assets,
            tvmExecutorFee,
            tvmValidExecutors,
        );
    }

    async isContractDeployedOnTVM(address: string): Promise<boolean> {
        return this.config.isContractDeployedOnTVM(address);
    }

    async simulateTACMessage(req: TACSimulationRequest): Promise<TACSimulationResult> {
        return this.simulator.simulateTACMessage(req);
    }

    async simulateTransactions(sender: SenderAbstraction, txs: CrosschainTx[]): Promise<TACSimulationResult[]> {
        return this.simulator.simulateTransactions(sender, txs);
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
        return NFT.getItemData(this.config.TONParams.contractOpener, itemAddress);
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
        if (tvmTokenAddress === this.nativeTONAddress || tvmTokenAddress === '') {
            return TON.create(this.config).getEVMAddress();
        }

        return FT.getEVMAddress(this.config, tvmTokenAddress);
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
}
