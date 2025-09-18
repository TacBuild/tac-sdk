import { Wallet } from 'ethers';

import { AssetFactory, NFT } from '../assets';
import { Asset, IConfiguration, ILogger, IOperationTracker, ITACTransactionManager } from '../interfaces';
import { AssetType } from '../structs/Struct';
import { TAC_SYMBOL } from './Consts';
import { NoopLogger } from './Logger';
import { formatObjectForLogging } from './Utils';
import { Validator } from './Validator';

export class TACTransactionManager implements ITACTransactionManager {
    constructor(
        private readonly config: IConfiguration,
        private readonly operationTracker: IOperationTracker,
        private readonly logger: ILogger = new NoopLogger(),
    ) {}

    private async approveAsset(asset: Asset, signer: Wallet, spenderAddress: string): Promise<void> {
        const evmAddress = await asset.getEVMAddress();
        
        if (asset.type === AssetType.FT) {
            this.logger.debug(`Approving FT ${evmAddress} for ${spenderAddress}`);
            const contract = this.config.artifacts.tac.wrappers.ERC20FactoryTAC.connect(evmAddress, this.config.TACParams.provider);
            const tx = await contract.connect(signer).approve(spenderAddress, asset.rawAmount);
            await tx.wait();
        } else if (asset.type === AssetType.NFT) {
            this.logger.debug(`Approving NFT ${evmAddress} for ${spenderAddress}`);
            const contract = this.config.artifacts.tac.wrappers.ERC721FactoryTAC.connect(evmAddress, this.config.TACParams.provider);
            const tx = await contract.connect(signer).approve(spenderAddress, (asset as NFT).addresses.index);
            await tx.wait();
        }
        
        this.logger.debug(`Approved ${evmAddress} for ${spenderAddress}`);
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

        // Add native TAC asset if value > 0
        if (value > 0n) {
            const nativeTacAsset = await (await AssetFactory.from(this.config, {
                address: await this.config.nativeTACAddress(),
                tokenType: AssetType.FT,
            })).withAmount({ rawAmount: value });
            assets = [...assets, nativeTacAsset];
        }

        // Calculate executor fee if not provided
        if (!tvmExecutorFee) {
            const feeParams = {
                tonAssets: assets.map(asset => ({
                    amount: asset.rawAmount.toString(),
                    tokenAddress: asset.address || '',
                    assetType: asset.type,
                })),
                feeSymbol: TAC_SYMBOL,
                tvmValidExecutors: tvmValidExecutors ?? [],
            };
            
            const suggestedFee = await this.operationTracker.getTVMExecutorFee(feeParams);
            this.logger.debug(`Suggested TON executor fee: ${formatObjectForLogging(suggestedFee)}`);
            tvmExecutorFee = BigInt(suggestedFee.inTAC);
        }

        // Approve all assets
        const crossChainLayerAddress = await this.config.TACParams.crossChainLayer.getAddress();
        await Promise.all(assets.map(asset => this.approveAsset(asset, signer, crossChainLayerAddress)));

        const protocolFee = await this.config.TACParams.crossChainLayer.getProtocolFee();
        const shardsKey = BigInt(Math.round(Math.random() * 1e18));
        
        this.logger.debug(`Shards key: ${shardsKey}, Protocol fee: ${protocolFee}`);

        // Prepare bridge data
        const [toBridge, toBridgeNFT] = await Promise.all([
            Promise.all(assets.filter(a => a.type === AssetType.FT).map(async a => ({
                evmAddress: await a.getEVMAddress(),
                amount: a.rawAmount,
            }))),
            Promise.all(assets.filter(a => a.type === AssetType.NFT).map(async a => ({
                evmAddress: await a.getEVMAddress(),
                amount: 1n,
                tokenId: (a as NFT).addresses.index,
            }))),
        ]);

        const outMessage = {
            shardsKey,
            tvmTarget: tonTarget,
            tvmPayload: '',
            tvmProtocolFee: protocolFee,
            tvmExecutorFee,
            tvmValidExecutors: this.config.getTrustedTONExecutors,
            toBridge,
            toBridgeNFT,
        };

        const totalValue = value + BigInt(outMessage.tvmProtocolFee) + BigInt(outMessage.tvmExecutorFee);
        this.logger.debug(`Total value: ${totalValue}`);

        const tx = await this.config.TACParams.crossChainLayer
            .connect(signer)
            .sendMessage(1n, this.config.artifacts.tac.utils.encodeOutMessageV1(outMessage), { value: totalValue });
        
        await tx.wait();
        this.logger.debug(`Transaction hash: ${tx.hash}`);
        return tx.hash;
    }
}