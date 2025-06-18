import { SandboxContract } from '@ton/sandbox';
import { Address, address, beginCell, Cell, fromNano, OpenedContract, toNano, TonClient } from '@ton/ton';
import { mainnet, testnet } from '@tonappchain/artifacts';
import { NFTCollection, NFTItem } from '@tonappchain/artifacts/dist/src/ton/wrappers';
import axios from 'axios';
import { ethers, isAddress as isEthereumAddress, keccak256, toUtf8Bytes, Wallet } from 'ethers';

import { emptyContractError, simulationError } from '../errors';
import { invalidAssetType } from '../errors/instances';
import type { SenderAbstraction } from '../sender';
// import internal structs
import {
    AssetOpType,
    InternalTACParams,
    InternalTONParams,
    JettonBridgingData,
    JettonBurnData,
    JettonTransferData,
    NFTBridgingData,
    NFTBurnData,
    NFTTransferData,
    ShardMessage,
    ShardTransaction,
    SuggestedTONExecutorFeeResponse,
    TACSimulationResponse,
} from '../structs/InternalStruct';
// import structs
import {
    AssetBridgingData,
    AssetType,
    CrossChainTransactionOptions,
    CrosschainTx,
    EvmProxyMsg,
    ExecutionFeeEstimationResult,
    FeeParams,
    Network,
    NFTAddressType,
    NFTItemData,
    OperationIdsByShardsKey,
    RawAssetBridgingData,
    SDKParams,
    SuggestedTONExecutorFee,
    TACParams,
    TACSimulationRequest,
    TACSimulationResult,
    TONParams,
    TransactionLinker,
    TransactionLinkerWithOperationId,
    UserWalletBalanceExtended,
    ValidExecutors,
    WaitOptions,
    WithAddressFT,
    WithAddressNFTCollectionItem,
} from '../structs/Struct';
// jetton imports
import { JettonMaster } from '../wrappers/JettonMaster';
import { JettonWallet } from '../wrappers/JettonWallet';
// ton settings
import { Settings } from '../wrappers/Settings';
import {
    DEFAULT_DELAY,
    JETTON_TRANSFER_FORWARD_TON_AMOUNT,
    NFT_TRANSFER_FORWARD_TON_AMOUNT,
    TAC_SYMBOL,
    TRANSACTION_TON_AMOUNT,
} from './Consts';
import { OperationTracker } from './OperationTracker';
import {
    buildEvmDataCell,
    calculateAmount,
    calculateContractAddress,
    calculateRawAmount,
    formatObjectForLogging,
    formatSolidityMethodName,
    generateFeeData,
    generateRandomNumberByTimestamp,
    generateTransactionLinker,
    sleep,
    toCamelCaseTransformer,
    validateEVMAddress,
    validateTVMAddress,
} from './Utils';

export class TacSdk {
    readonly network: Network;
    readonly delay: number;
    readonly artifacts: typeof testnet | typeof mainnet;
    readonly TONParams: InternalTONParams;
    readonly TACParams: InternalTACParams;
    readonly liteSequencerEndpoints: string[];
    readonly operationTracker: OperationTracker;
    readonly debug: boolean;

    private constructor(
        network: Network,
        delay: number,
        artifacts: typeof testnet | typeof mainnet,
        TONParams: InternalTONParams,
        TACParams: InternalTACParams,
        liteSequencerEndpoints: string[],
        debug: boolean,
    ) {
        this.network = network;
        this.delay = delay;
        this.artifacts = artifacts;
        this.TONParams = TONParams;
        this.TACParams = TACParams;
        this.liteSequencerEndpoints = liteSequencerEndpoints;
        this.debug = debug;
        this.operationTracker = new OperationTracker(network, liteSequencerEndpoints, debug);
    }

    static async create(sdkParams: SDKParams): Promise<TacSdk> {
        const network = sdkParams.network;
        const delay = sdkParams.delay ?? DEFAULT_DELAY;
        const artifacts = network === Network.TESTNET ? testnet : mainnet;
        const TONParams = await this.prepareTONParams(delay, artifacts, sdkParams.TONParams);
        const TACParams = await this.prepareTACParams(artifacts, delay, sdkParams.TACParams);
        const debug = sdkParams.debug ?? false;

        const liteSequencerEndpoints =
            sdkParams.customLiteSequencerEndpoints ??
            (network === Network.TESTNET
                ? testnet.PUBLIC_LITE_SEQUENCER_ENDPOINTS
                : mainnet.PUBLIC_LITE_SEQUENCER_ENDPOINTS);
        return new TacSdk(network, delay, artifacts, TONParams, TACParams, liteSequencerEndpoints, debug);
    }

    private static async prepareTONParams(
        delay: number,
        artifacts: typeof testnet | typeof mainnet,
        TONParams?: TONParams,
    ): Promise<InternalTONParams> {
        const contractOpener =
            TONParams?.contractOpener ??
            new TonClient({
                endpoint: new URL('api/v2/jsonRPC', artifacts.TON_RPC_ENDPOINT_BY_TAC).toString()
            });
        const settingsAddress = TONParams?.settingsAddress 
                                ?? artifacts.TON_SETTINGS_ADDRESS;
        const settings = contractOpener.open(new Settings(Address.parse(settingsAddress)));

        const jettonProxyAddress = await settings.getAddressSetting('JettonProxyAddress');
        await sleep(delay * 1000);
        const crossChainLayerAddress = await settings.getAddressSetting('CrossChainLayerAddress');
        await sleep(delay * 1000);
        const jettonMinterCode = await settings.getCellSetting('JettonMinterCode');
        await sleep(delay * 1000);
        const jettonWalletCode = await settings.getCellSetting('JettonWalletCode');
        await sleep(delay * 1000);
        const nftProxyAddress = await settings.getAddressSetting('NFTProxyAddress');
        await sleep(delay * 1000);
        const nftItemCode = await settings.getCellSetting('NFTItemCode');
        await sleep(delay * 1000);
        const nftCollectionCode = await settings.getCellSetting('NFTCollectionCode');
        await sleep(delay * 1000);

        return {
            contractOpener,
            jettonProxyAddress,
            crossChainLayerAddress,
            jettonMinterCode,
            jettonWalletCode,
            nftProxyAddress,
            nftItemCode,
            nftCollectionCode,
        };
    }

    private static async prepareTACParams(
        artifacts: typeof testnet | typeof mainnet,
        delay: number,
        TACParams?: TACParams,
    ): Promise<InternalTACParams> {
        const provider = TACParams?.provider ?? ethers.getDefaultProvider(artifacts.TAC_RPC_ENDPOINT);

        const settingsAddress = TACParams?.settingsAddress?.toString() 
                            ?? artifacts.TAC_SETTINGS_ADDRESS;

        const settings = artifacts.tac.wrappers.SettingsFactoryTAC.connect(settingsAddress, provider);
        const crossChainLayerABI =
            TACParams?.crossChainLayerABI ?? artifacts.tac.compilationArtifacts.CrossChainLayer.abi;
        const crossChainLayerAddress = await settings.getAddressSetting(
            keccak256(toUtf8Bytes('CrossChainLayerAddress')),
        );
        const crossChainLayer = artifacts.tac.wrappers.CrossChainLayerFactoryTAC.connect(
            crossChainLayerAddress,
            provider,
        );
        await sleep(delay * 1000);

        const tokenUtilsAddress = await settings.getAddressSetting(keccak256(toUtf8Bytes('TokenUtilsAddress')));
        const tokenUtils = artifacts.tac.wrappers.TokenUtilsFactoryTAC.connect(tokenUtilsAddress, provider);
        await sleep(delay * 1000);

        const trustedTACExecutors = await settings.getTrustedEVMExecutors();
        await sleep(delay * 1000);
        const trustedTONExecutors = await settings.getTrustedTVMExecutors();

        const crossChainLayerTokenABI =
            TACParams?.crossChainLayerTokenABI ?? artifacts.tac.compilationArtifacts.CrossChainLayerToken.abi;
        const crossChainLayerTokenBytecode =
            TACParams?.crossChainLayerTokenBytecode ?? artifacts.tac.compilationArtifacts.CrossChainLayerToken.bytecode;

        const crossChainLayerNFTABI =
            TACParams?.crossChainLayerNFTABI ?? artifacts.tac.compilationArtifacts.CrossChainLayerNFT.abi;
        const crossChainLayerNFTBytecode =
            TACParams?.crossChainLayerNFTBytecode ?? artifacts.tac.compilationArtifacts.CrossChainLayerNFT.bytecode;

        return {
            provider,
            settings,
            tokenUtils,
            crossChainLayer,
            trustedTACExecutors,
            trustedTONExecutors,
            abiCoder: new ethers.AbiCoder(),
            crossChainLayerABI,
            crossChainLayerTokenABI,
            crossChainLayerTokenBytecode,
            crossChainLayerNFTABI,
            crossChainLayerNFTBytecode,
        };
    }

    closeConnections(): unknown {
        return this.TONParams.contractOpener.closeConnections?.call(this);
    }

    get nativeTONAddress(): string {
        return 'NONE';
    }

    async nativeTACAddress(): Promise<string> {
        return this.TACParams.crossChainLayer.NATIVE_TOKEN_ADDRESS.staticCall();
    }

    async getUserJettonWalletAddress(userAddress: string, tokenAddress: string): Promise<string> {
        const jettonMaster = this.TONParams.contractOpener.open(new JettonMaster(Address.parse(tokenAddress)));
        return jettonMaster.getWalletAddress(userAddress);
    }

    async getUserJettonBalance(userAddress: string, tokenAddress: string): Promise<bigint> {
        const jettonMaster = this.TONParams.contractOpener.open(new JettonMaster(Address.parse(tokenAddress)));
        const userJettonWalletAddress = await jettonMaster.getWalletAddress(userAddress);
        await sleep(this.delay * 1000);

        const userJettonWallet = this.TONParams.contractOpener.open(
            new JettonWallet(Address.parse(userJettonWalletAddress)),
        );
        return userJettonWallet.getJettonBalance();
    }

    async getUserJettonBalanceExtended(userAddress: string, tokenAddress: string): Promise<UserWalletBalanceExtended> {
        const masterAddress = Address.parse(tokenAddress);
        const masterState = await this.TONParams.contractOpener.getContractState(masterAddress);
        if (masterState.state !== 'active') {
            return { exists: false };
        }
        await sleep(this.delay * 1000);

        const jettonMaster = this.TONParams.contractOpener.open(new JettonMaster(masterAddress));
        const userJettonWalletAddress = await jettonMaster.getWalletAddress(userAddress);
        await sleep(this.delay * 1000);

        const userJettonWallet = this.TONParams.contractOpener.open(
            new JettonWallet(Address.parse(userJettonWalletAddress)),
        );

        const rawAmount = await userJettonWallet.getJettonBalance();
        const decimalsRaw = (await jettonMaster.getJettonData()).content.metadata.decimals;
        const decimals = decimalsRaw ? Number(decimalsRaw) : 9;

        return {
            rawAmount,
            decimals,
            amount: calculateAmount(rawAmount, decimals),
            exists: true,
        };
    }

    private getJettonTransferPayload(
        jettonData: JettonTransferData,
        responseAddress: string,
        evmData: Cell,
        crossChainTonAmount: bigint,
        forwardFeeAmount: bigint,
        feeData?: Cell,
    ): Cell {
        const queryId = generateRandomNumberByTimestamp().randomNumber;

        return JettonWallet.transferMessage(
            jettonData.rawAmount,
            this.TONParams.jettonProxyAddress,
            responseAddress,
            JETTON_TRANSFER_FORWARD_TON_AMOUNT + forwardFeeAmount + crossChainTonAmount,
            crossChainTonAmount,
            feeData,
            evmData,
            queryId,
        );
    }

    private getJettonBurnPayload(
        jettonData: JettonBurnData,
        evmData: Cell,
        crossChainTonAmount: bigint,
        feeData?: Cell,
    ): Cell {
        const queryId = generateRandomNumberByTimestamp().randomNumber;
        return JettonWallet.burnMessage(
            jettonData.rawAmount,
            jettonData.notificationReceiverAddress,
            crossChainTonAmount,
            feeData,
            evmData,
            queryId,
        );
    }

    private getNFTBurnPayload(burnData: NFTBurnData): Cell {
        const queryId = generateRandomNumberByTimestamp().randomNumber;

        return NFTItem.burnMessage(
            queryId,
            address(burnData.notificationReceiverAddress),
            burnData.crossChainTonAmount ?? 0,
            burnData.evmData,
            burnData.feeData,
        );
    }

    private getNFTTransferPayload(transferData: NFTTransferData, forwardFeeAmount: bigint): Cell {
        const queryId = generateRandomNumberByTimestamp().randomNumber;
        const crossChainTonAmount = transferData.crossChainTonAmount ?? 0n;
        const forwardPayload = beginCell()
            .storeCoins(crossChainTonAmount)
            .storeMaybeRef(transferData.feeData)
            .storeMaybeRef(transferData.evmData)
            .endCell();

        return NFTItem.transferMessage(
            queryId,
            address(transferData.to ?? this.TONParams.nftProxyAddress),
            address(transferData.responseAddress),
            Number(fromNano(NFT_TRANSFER_FORWARD_TON_AMOUNT + forwardFeeAmount + crossChainTonAmount)),
            forwardPayload,
        );
    }

    private getTonTransferPayload(
        responseAddress: string,
        evmData: Cell,
        crossChainTonAmount: bigint,
        feeParams: FeeParams,
    ): Cell {
        const queryId = generateRandomNumberByTimestamp().randomNumber;
        const feeData = generateFeeData(feeParams);

        return beginCell()
            .storeUint(this.artifacts.ton.wrappers.CrossChainLayerOpCodes.anyone_tvmMsgToEVM, 32)
            .storeUint(queryId, 64)
            .storeUint(this.artifacts.ton.wrappers.OperationType.tonTransfer, 32)
            .storeCoins(crossChainTonAmount)
            .storeMaybeRef(feeData)
            .storeAddress(Address.parse(responseAddress))
            .storeMaybeRef(evmData)
            .endCell();
    }

    private debugLog(message: string) {
        if (this.debug) {
            console.log(`[TacSdk Debug] ${message}`);
        }
    }

    private async getJettonOpType(
        asset: JettonBridgingData,
    ): Promise<AssetOpType.JETTON_BURN | AssetOpType.JETTON_TRANSFER> {
        this.debugLog(`Getting jetton op type for ${formatObjectForLogging(asset)}`);
        const { code: givenMinterCodeBOC } = await this.TONParams.contractOpener.getContractState(
            address(asset.address),
        );
        if (!givenMinterCodeBOC) {
            throw emptyContractError;
        }
        const givenMinterCode = Cell.fromBoc(givenMinterCodeBOC)[0];
        await sleep(this.delay * 1000);

        if (!this.TONParams.jettonMinterCode.equals(givenMinterCode)) {
            this.debugLog(`Jetton ${formatObjectForLogging(asset)} requires JETTON_TRANSFER operation`);
            return AssetOpType.JETTON_TRANSFER;
        }

        const givenMinter = this.TONParams.contractOpener.open(new JettonMaster(address(asset.address)));
        const evmAddress = await givenMinter.getEVMAddress();
        await sleep(this.delay * 1000);
        this.debugLog(`Jetton ${formatObjectForLogging(asset)} has evm address ${evmAddress}`);

        const expectedMinterAddress = await calculateContractAddress(
            this.TONParams.jettonMinterCode,
            beginCell()
                .storeCoins(0)
                .storeAddress(address(this.TONParams.crossChainLayerAddress))
                .storeAddress(null)
                .storeRef(beginCell().endCell())
                .storeRef(this.TONParams.jettonWalletCode)
                .storeStringTail(evmAddress)
                .endCell(),
        );

        if (!expectedMinterAddress.equals(givenMinter.address)) {
            this.debugLog(`Jetton ${formatObjectForLogging(asset)} requires JETTON_TRANSFER operation`);
            return AssetOpType.JETTON_TRANSFER;
        }

        this.debugLog(`Jetton ${formatObjectForLogging(asset)} requires JETTON_BURN operation`);
        return AssetOpType.JETTON_BURN;
    }

    private async getNFTOpType(asset: NFTBridgingData): Promise<AssetOpType.NFT_BURN | AssetOpType.NFT_TRANSFER> {
        this.debugLog(`Getting NFT op type for ${formatObjectForLogging(asset)}`);
        const { code: itemCodeBOC } = await this.TONParams.contractOpener.getContractState(address(asset.address));
        if (!itemCodeBOC) {
            throw emptyContractError;
        }
        const givenNFTItemCode = Cell.fromBoc(itemCodeBOC)[0];
        await sleep(this.delay * 1000);

        if (!this.TONParams.nftItemCode.equals(givenNFTItemCode)) {
            this.debugLog(`NFT ${formatObjectForLogging(asset)} requires NFT_TRANSFER operation`);
            return AssetOpType.NFT_TRANSFER;
        }

        this.debugLog(`NFT ${formatObjectForLogging(asset)} requires NFT_BURN operation`);
        return AssetOpType.NFT_BURN;
    }

    private async getNFTItemAddressTON(collectionAddress: string, itemIndex: bigint): Promise<string> {
        validateTVMAddress(collectionAddress);
        const nftCollection = this.TONParams.contractOpener.open(
            NFTCollection.createFromAddress(address(collectionAddress)),
        );
        return (await nftCollection.getNFTAddressByIndex(itemIndex)).toString();
    }

    async getNFTItemData(itemAddress: string): Promise<NFTItemData> {
        validateTVMAddress(itemAddress);
        const nftItem = this.TONParams.contractOpener.open(NFTItem.createFromAddress(address(itemAddress)));
        return await nftItem.getNFTData();
    }

    private async aggregateTokens(assets?: RawAssetBridgingData[]): Promise<{
        jettons: JettonBridgingData[];
        nfts: NFTBridgingData[];
        crossChainTonAmount: bigint;
    }> {
        this.debugLog(`Aggregating tokens`);
        const uniqueAssetsMap: Map<string, bigint> = new Map();
        let crossChainTonAmount = 0n;

        for await (const asset of assets ?? []) {
            if (asset.rawAmount <= 0) continue;

            if (asset.type !== AssetType.FT) continue;

            if (asset.address) {
                validateTVMAddress(asset.address);

                uniqueAssetsMap.set(
                    asset.address,
                    (uniqueAssetsMap.get(asset.address) || 0n) + BigInt(asset.rawAmount),
                );
            } else {
                crossChainTonAmount += BigInt(asset.rawAmount);
            }
        }
        const jettons: JettonBridgingData[] = Array.from(uniqueAssetsMap.entries()).map(([address, rawAmount]) => ({
            address,
            rawAmount,
            type: AssetType.FT,
        }));
        this.debugLog(`Aggregated ${jettons.length} jettons`);
        this.debugLog(`Crosschain ton amount: ${crossChainTonAmount}`);

        uniqueAssetsMap.clear();
        for await (const asset of assets ?? []) {
            if (asset.type !== AssetType.NFT) continue;
            validateTVMAddress(asset.address);
            uniqueAssetsMap.set(asset.address, 1n);
        }
        const nfts: NFTBridgingData[] = Array.from(uniqueAssetsMap.entries()).map(([address, rawAmount]) => ({
            address,
            rawAmount,
            type: AssetType.NFT,
        }));
        this.debugLog(`Aggregated ${nfts.length} nfts`);

        return {
            jettons,
            nfts,
            crossChainTonAmount,
        };
    }

    private async generateJettonPayload(
        jetton: JettonBridgingData,
        caller: string,
        evmData: Cell,
        crossChainTonAmount: bigint,
        forwardFeeTonAmount: bigint,
        feeParams?: FeeParams,
    ) {
        this.debugLog(`Generating jetton payload for ${formatObjectForLogging(jetton)}`);
        const opType = await this.getJettonOpType(jetton);
        await sleep(this.delay * 1000);

        this.debugLog(`Generation fee data with params: ${formatObjectForLogging(feeParams)}`);
        const feeData = generateFeeData(feeParams);

        let payload: Cell;
        switch (opType) {
            case AssetOpType.JETTON_BURN:
                payload = this.getJettonBurnPayload(
                    {
                        notificationReceiverAddress: this.TONParams.crossChainLayerAddress,
                        ...jetton,
                    },
                    evmData,
                    crossChainTonAmount,
                    feeData,
                );
                break;
            case AssetOpType.JETTON_TRANSFER:
                payload = this.getJettonTransferPayload(
                    jetton,
                    caller,
                    evmData,
                    crossChainTonAmount,
                    forwardFeeTonAmount,
                    feeData,
                );
                break;
        }

        this.debugLog('Generating jetton payload success');
        return payload;
    }

    private async generateNFTPayload(
        nft: NFTBridgingData,
        caller: string,
        evmData: Cell,
        crossChainTonAmount: bigint,
        forwardFeeTonAmount: bigint,
        feeParams?: FeeParams,
    ): Promise<Cell> {
        this.debugLog(`Generating NFT payload for ${formatObjectForLogging(nft)}`);
        const opType = await this.getNFTOpType(nft);
        await sleep(this.delay * 1000);

        this.debugLog(`Generation fee data with params: ${formatObjectForLogging(feeParams)}`);
        const feeData = generateFeeData(feeParams);

        let payload: Cell;
        switch (opType) {
            case AssetOpType.NFT_BURN:
                payload = this.getNFTBurnPayload({
                    notificationReceiverAddress: this.TONParams.crossChainLayerAddress,
                    ...nft,
                    evmData,
                    crossChainTonAmount,
                    feeData,
                });
                break;
            case AssetOpType.NFT_TRANSFER:
                payload = this.getNFTTransferPayload(
                    {
                        to: this.TONParams.nftProxyAddress,
                        responseAddress: caller,
                        evmData,
                        crossChainTonAmount,
                        feeData,
                        ...nft,
                    },
                    forwardFeeTonAmount,
                );
                break;
        }

        this.debugLog('Generating NFT payload success');
        return payload;
    }

    private async generateCrossChainMessages(
        caller: string,
        evmData: Cell,

        aggregatedData: {
            jettons: JettonBridgingData[];
            nfts: NFTBridgingData[];
            crossChainTonAmount: bigint;
        },

        feeParams: FeeParams,
    ): Promise<ShardMessage[]> {
        this.debugLog(`Generating cross-chain messages`);
        let crossChainTonAmount = aggregatedData.crossChainTonAmount;
        let feeTonAmount = feeParams.protocolFee + feeParams.evmExecutorFee + feeParams.tvmExecutorFee;
        this.debugLog(`Crosschain ton amount: ${crossChainTonAmount}`);
        this.debugLog(`Fee ton amount: ${feeTonAmount}`);

        if (aggregatedData.jettons.length == 0 && aggregatedData.nfts.length == 0) {
            return [
                {
                    address: this.TONParams.crossChainLayerAddress,
                    value: crossChainTonAmount + feeTonAmount + TRANSACTION_TON_AMOUNT,
                    payload: this.getTonTransferPayload(caller, evmData, crossChainTonAmount, feeParams),
                },
            ];
        }

        const messages: ShardMessage[] = [];

        let currentFeeParams: FeeParams | undefined = feeParams;
        for (const jetton of aggregatedData.jettons) {
            const payload = await this.generateJettonPayload(
                jetton,
                caller,
                evmData,
                crossChainTonAmount,
                feeTonAmount,
                currentFeeParams,
            );
            await sleep(this.delay * 1000);
            const jettonWalletAddress = await this.getUserJettonWalletAddress(caller, jetton.address);
            await sleep(this.delay * 1000);
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
            const payload = await this.generateNFTPayload(
                nft,
                caller,
                evmData,
                crossChainTonAmount,
                feeTonAmount,
                currentFeeParams,
            );
            await sleep(this.delay * 1000);
            messages.push({
                address: nft.address,
                value: crossChainTonAmount + feeTonAmount + TRANSACTION_TON_AMOUNT,
                payload,
            });

            crossChainTonAmount = 0n;
            feeTonAmount = 0n;
            currentFeeParams = undefined;
        }

        this.debugLog('Generating cross-chain messages success');
        return messages;
    }

    private async getRawAmount(asset: AssetBridgingData, precalculatedAddress: string | undefined): Promise<bigint> {
        this.debugLog(`Getting raw amount for ${formatObjectForLogging(precalculatedAddress ?? 'TON')}`);
        if ('rawAmount' in asset) {
            this.debugLog(`Provided raw amount: ${asset.rawAmount}`);
            return asset.rawAmount;
        }

        if (!precalculatedAddress) {
            // User specified TON Coin
            const rawAmount = toNano(asset.amount);
            this.debugLog(`TON raw amount: ${rawAmount}`);
            return rawAmount;
        }

        if (typeof asset.decimals === 'number') {
            // User manually set decimals
            const rawAmount = calculateRawAmount(asset.amount, asset.decimals);
            this.debugLog(`Raw amount calculated from decimals: ${rawAmount}`);
            return rawAmount;
        }

        // Get decimals from chain
        validateTVMAddress(precalculatedAddress);
        this.debugLog('Getting decimals from chain');

        const contract = this.TONParams.contractOpener.open(new JettonMaster(address(precalculatedAddress)));
        const { content } = await contract.getJettonData();
        await sleep(this.delay * 1000);
        if (!content.metadata.decimals) {
            // if decimals not specified use default value 9
            this.debugLog('Decimals not specified, using default value 9');
            return toNano(asset.amount);
        }

        const rawAmount = calculateRawAmount(asset.amount, Number(content.metadata.decimals));
        this.debugLog(`Raw amount calculated from decimals(${content.metadata.decimals}): ${rawAmount}`);
        return rawAmount;
    }

    private async convertAssetsToRawFormat(assets?: AssetBridgingData[]): Promise<RawAssetBridgingData[]> {
        this.debugLog(`Converting assets to raw format`);
        return await Promise.all(
            (assets ?? []).map(async (asset) => {
                this.debugLog(`Converting asset to raw format: ${formatObjectForLogging(asset)}`);
                if (asset.type === AssetType.FT) {
                    const address = isEthereumAddress(asset.address)
                        ? await this.getTVMTokenAddress(asset.address)
                        : asset.address;
                    this.debugLog(`Token address on TON: ${address}`);
                    return {
                        address,
                        rawAmount: await this.getRawAmount(asset, address),
                        type: asset.type,
                    };
                }

                if (asset.type === AssetType.NFT) {
                    if ('collectionAddress' in asset) {
                        const address = isEthereumAddress(asset.collectionAddress)
                            ? await this.getTVMNFTAddress(asset.collectionAddress, asset.itemIndex)
                            : await this.getNFTItemAddressTON(asset.collectionAddress, asset.itemIndex);
                        this.debugLog(`NFT address on TON: ${address}`);
                        await sleep(this.delay * 1000);
                        return {
                            address,
                            rawAmount: 1n,
                            type: asset.type,
                        };
                    }
                    validateTVMAddress(asset.address);
                    return {
                        address: asset.address,
                        rawAmount: 1n,
                        type: asset.type,
                    };
                }
                throw invalidAssetType;
            }),
        );
    }

    private async getFeeInfo(
        evmProxyMsg: EvmProxyMsg,
        transactionLinker: TransactionLinker,
        rawAssets: RawAssetBridgingData[],
        forceSend: boolean = false,
        isRoundTrip: boolean = true,
        evmValidExecutors: string[] = this.TACParams.trustedTACExecutors,
    ): Promise<ExecutionFeeEstimationResult> {
        this.debugLog('Getting fee info');
        const crossChainLayer = this.TONParams.contractOpener.open(
            this.artifacts.ton.wrappers.CrossChainLayer.createFromAddress(
                Address.parse(this.TONParams.crossChainLayerAddress),
            ),
        );
        const fullStateCCL = await crossChainLayer.getFullData();
        await sleep(this.delay * 1000);
        this.debugLog(`Full state CCL: ${formatObjectForLogging(fullStateCCL)}`);

        const tacSimulationBody: TACSimulationRequest = {
            tacCallParams: {
                arguments: evmProxyMsg.encodedParameters ?? '0x',
                methodName: formatSolidityMethodName(evmProxyMsg.methodName),
                target: evmProxyMsg.evmTargetAddress,
            },
            evmValidExecutors: evmValidExecutors,
            extraData: '0x',
            shardsKey: transactionLinker.shardsKey,
            tonAssets: rawAssets.map((asset) => ({
                amount: asset.rawAmount.toString(),
                tokenAddress: asset.address || '',
                assetType: asset.type,
            })),
            tonCaller: transactionLinker.caller,
        };

        isRoundTrip = isRoundTrip ?? rawAssets.length != 0;
        this.debugLog(`Is round trip: ${isRoundTrip}`);

        const tacSimulationResult = await this.simulateTACMessage(tacSimulationBody);
        this.debugLog(`TAC simulation ${tacSimulationResult.simulationStatus ? 'success' : 'failed'}`);
        if (!tacSimulationResult.simulationStatus) {
            if (forceSend) {
                this.debugLog('Force send is true, returning fee params');
                return {
                    feeParams: {
                        isRoundTrip,
                        gasLimit: 0n,
                        protocolFee:
                            BigInt(toNano(fullStateCCL.tacProtocolFee!)) +
                            BigInt(isRoundTrip) * BigInt(toNano(fullStateCCL.tonProtocolFee!)),
                        evmExecutorFee: BigInt(tacSimulationResult.suggestedTacExecutionFee),
                        tvmExecutorFee: BigInt(tacSimulationResult.suggestedTonExecutionFee) * BigInt(isRoundTrip),
                    },
                    simulation: tacSimulationResult,
                };
            }
            throw tacSimulationResult;
        }

        const protocolFee =
            BigInt(toNano(fullStateCCL.tacProtocolFee!)) +
            BigInt(isRoundTrip) * BigInt(toNano(fullStateCCL.tonProtocolFee!));

        const feeParams: FeeParams = {
            isRoundTrip: isRoundTrip,
            gasLimit: tacSimulationResult.estimatedGas,
            protocolFee: protocolFee,
            evmExecutorFee: BigInt(tacSimulationResult.suggestedTacExecutionFee),
            tvmExecutorFee: BigInt(tacSimulationResult.suggestedTonExecutionFee) * BigInt(isRoundTrip),
        };
        this.debugLog(`Collected fee params: ${formatObjectForLogging(feeParams)}`);

        return { feeParams: feeParams, simulation: tacSimulationResult };
    }

    async getTransactionSimulationInfo(
        evmProxyMsg: EvmProxyMsg,
        sender: SenderAbstraction,
        assets?: AssetBridgingData[],
    ): Promise<ExecutionFeeEstimationResult> {
        this.debugLog('Getting transaction simulation info');
        const rawAssets = await this.convertAssetsToRawFormat(assets);
        const aggregatedData = await this.aggregateTokens(rawAssets);
        const transactionLinkerShardCount = aggregatedData.jettons.length == 0 ? 1 : aggregatedData.jettons.length;
        this.debugLog(`Transaction linker shard count: ${transactionLinkerShardCount}`);

        const transactionLinker = generateTransactionLinker(sender.getSenderAddress(), transactionLinkerShardCount);
        this.debugLog(`Transaction linker: ${formatObjectForLogging(transactionLinker)}`);

        return await this.getFeeInfo(evmProxyMsg, transactionLinker, rawAssets);
    }

    async getTVMExecutorFeeInfo(assets: AssetBridgingData[], feeSymbol: string): Promise<SuggestedTONExecutorFee> {
        this.debugLog('Getting TVM executor fee info');
        const rawAssets = await this.convertAssetsToRawFormat(assets);
        const requestBody = {
            tonAssets: rawAssets.map((asset) => ({
                amount: asset.rawAmount.toString(),
                tokenAddress: asset.address || '',
                assetType: asset.type,
            })),
            feeSymbol: feeSymbol,
        };

        let lastError;
        for (const endpoint of this.liteSequencerEndpoints) {
            try {
                const response = await axios.post<SuggestedTONExecutorFeeResponse>(
                    `${endpoint}/ton/calculator/ton-executor-fee`,
                    requestBody,
                );

                return response.data.response;
            } catch (error) {
                this.debugLog(`Error while calculating tvm executor fee ${endpoint}: ${error}`);
                lastError = error;
            }
        }
        this.debugLog('Error while calculating tvm executor fee on all endpoints');
        throw simulationError(lastError);
    }

    private async prepareCrossChainTransaction(
        evmProxyMsg: EvmProxyMsg,
        caller: string,
        assets?: AssetBridgingData[],
        options?: CrossChainTransactionOptions,
    ): Promise<{ transaction: ShardTransaction; transactionLinker: TransactionLinker }> {
        this.debugLog('Preparing cross-chain transaction');
        const {
            forceSend = false,
            isRoundTrip = undefined,
            protocolFee = undefined,
            evmExecutorFee = undefined,
            tvmExecutorFee = undefined,
        } = options || {};
        let { evmValidExecutors = [], tvmValidExecutors = [] } = options || {};

        const rawAssets = await this.convertAssetsToRawFormat(assets);
        const aggregatedData = await this.aggregateTokens(rawAssets);

        const tokensLength = aggregatedData.jettons.length + aggregatedData.nfts.length;
        this.debugLog(`Tokens length: ${tokensLength}`);
        const transactionLinkerShardCount = tokensLength == 0 ? 1 : tokensLength;
        this.debugLog(`Transaction linker shard count: ${transactionLinkerShardCount}`);

        const transactionLinker = generateTransactionLinker(caller, transactionLinkerShardCount);
        this.debugLog(`Generated transaction linker: ${formatObjectForLogging(transactionLinker)}`);

        if (evmValidExecutors.length == 0) {
            evmValidExecutors = this.TACParams.trustedTACExecutors;
        }

        if (tvmValidExecutors.length == 0) {
            tvmValidExecutors = this.TACParams.trustedTONExecutors;
        }

        const { feeParams } = await this.getFeeInfo(
            evmProxyMsg,
            transactionLinker,
            rawAssets,
            forceSend,
            isRoundTrip,
            evmValidExecutors,
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
        this.debugLog(`Resulting fee params: ${formatObjectForLogging(feeParams)}`);

        const validExecutors: ValidExecutors = {
            tac: evmValidExecutors,
            ton: tvmValidExecutors,
        };
        this.debugLog(`Valid executors: ${formatObjectForLogging(validExecutors)}`);

        const evmData = buildEvmDataCell(transactionLinker, evmProxyMsg, validExecutors);
        const messages = await this.generateCrossChainMessages(caller, evmData, aggregatedData, feeParams);
        await sleep(this.delay * 1000);

        const transaction: ShardTransaction = {
            validUntil: +new Date() + 15 * 60 * 1000,
            messages,
            network: this.network,
        };

        this.debugLog('Transaction prepared');
        return { transaction, transactionLinker };
    }

    async sendCrossChainTransaction(
        evmProxyMsg: EvmProxyMsg,
        sender: SenderAbstraction,
        assets?: AssetBridgingData[],
        options?: CrossChainTransactionOptions,
        waitOptions?: WaitOptions<string>,
    ): Promise<TransactionLinkerWithOperationId> {
        const caller = sender.getSenderAddress();
        this.debugLog(`Caller: ${caller}`);

        const { transaction, transactionLinker } = await this.prepareCrossChainTransaction(
            evmProxyMsg,
            caller,
            assets,
            options,
        );

        this.debugLog(`*****Sending transaction: ${formatObjectForLogging(transaction)}`);
        const sendTransactionResult = await sender.sendShardTransaction(
            transaction,
            this.delay,
            this.network,
            this.TONParams.contractOpener,
        );

        return waitOptions
            ? {
                  sendTransactionResult,
                  operationId: await this.operationTracker.getOperationId(transactionLinker, {
                      ...waitOptions,
                      successCheck: (operationId: string) => !!operationId,
                      log: this.debugLog.bind(this),
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
        const transactions: ShardTransaction[] = [];
        const transactionLinkers: TransactionLinker[] = [];
        const caller = sender.getSenderAddress();
        this.debugLog(`Caller: ${caller}`);

        this.debugLog('Preparing multiple cross-chain transactions');

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

        this.debugLog(`*****Sending transactions: ${formatObjectForLogging(transactions)}`);
        await sender.sendShardTransactions(transactions, this.delay, this.network, this.TONParams.contractOpener);

        if (waitOptions) {
            this.debugLog(`Waiting for operation IDs`);
            try {
                const operationIds = await this.operationTracker.getOperationIdsByShardsKeys(
                    transactionLinkers.map((linker) => linker.shardsKey),
                    caller,
                    {
                        ...waitOptions,
                        log: this.debugLog.bind(this),
                        successCheck: (operationIds: OperationIdsByShardsKey) => {
                            return (
                                Object.keys(operationIds).length == transactionLinkers.length &&
                                Object.values(operationIds).every((ids) => ids.operationIds.length > 0)
                            );
                        },
                    },
                );
                this.debugLog(`Operation IDs: ${formatObjectForLogging(operationIds)}`);
                return transactionLinkers.map((linker) => ({
                    ...linker,
                    operationId: operationIds[linker.shardsKey].operationIds.at(0),
                }));
            } catch (error) {
                this.debugLog(`Error while waiting for operation IDs: ${error}`);
            }
        }
        return transactionLinkers;
    }

    // TODO move to sdk.TAC, sdk.TON
    async bridgeTokensToTON(
        signer: Wallet,
        value: bigint,
        tonTarget: string,
        assets?: RawAssetBridgingData<WithAddressNFTCollectionItem>[],
        tvmExecutorFee?: bigint,
    ): Promise<string> {
        this.debugLog('Bridging tokens to TON');

        if (assets == undefined) {
            assets = [];
        }
        const tonAssets: AssetBridgingData[] = [];
        for (const asset of assets) {
            if (asset.type == AssetType.FT) {
                const tvmAddress = await this.getTVMTokenAddress(asset.address!);
                tonAssets.push({
                    address: tvmAddress,
                    rawAmount: asset.rawAmount,
                    type: AssetType.FT,
                });
            } else {
                const nftItemAddress = await this.getTVMNFTAddress(asset.collectionAddress, asset.itemIndex);
                tonAssets.push({
                    address: nftItemAddress,
                    amount: 1,
                    type: AssetType.NFT,
                });
            }
        }
        this.debugLog(`TON assets: ${formatObjectForLogging(tonAssets)}`);

        if (value > 0) {
            this.debugLog('Adding native TAC to TON assets');
            const tvmAddress = await this.getTVMTokenAddress(await this.nativeTACAddress());
            tonAssets.push({
                address: tvmAddress,
                rawAmount: value,
                type: AssetType.FT,
            });
        }

        const suggestedTONExecutorFee = await this.getTVMExecutorFeeInfo(tonAssets, TAC_SYMBOL);
        this.debugLog(`Suggested TON executor fee: ${formatObjectForLogging(suggestedTONExecutorFee)}`);

        const crossChainLayerAddress = await this.TACParams.crossChainLayer.getAddress();
        for (const asset of assets) {
            if (asset.type == AssetType.FT) {
                this.debugLog(`Approving token ${asset.address} for ${crossChainLayerAddress}`);
                const tokenContract = this.artifacts.tac.wrappers.ERC20FactoryTAC.connect(
                    asset.address!,
                    this.TACParams.provider,
                );

                const tx = await tokenContract.connect(signer).approve(crossChainLayerAddress, asset.rawAmount);
                await tx.wait();
                this.debugLog(`Approved ${asset.address} for ${crossChainLayerAddress}`);
            }
            if (asset.type == AssetType.NFT) {
                this.debugLog(`Approving collection ${asset.collectionAddress} for ${crossChainLayerAddress}`);
                const tokenContract = this.artifacts.tac.wrappers.ERC721FactoryTAC.connect(
                    asset.collectionAddress,
                    this.TACParams.provider,
                );
                const tx = await tokenContract.connect(signer).approve(crossChainLayerAddress, asset.itemIndex);
                await tx.wait();
                this.debugLog(`Approved ${asset.collectionAddress} for ${crossChainLayerAddress}`);
            }
        }

        const shardsKey = BigInt(Math.round(Math.random() * 1e18));
        this.debugLog(`Shards key: ${shardsKey}`);

        const protocolFee = await this.TACParams.crossChainLayer.getProtocolFee();
        this.debugLog(`Protocol fee: ${protocolFee}`);

        const outMessage = {
            shardsKey: shardsKey,
            tvmTarget: tonTarget,
            tvmPayload: '',
            tvmProtocolFee: protocolFee,
            tvmExecutorFee: tvmExecutorFee ?? BigInt(suggestedTONExecutorFee.inTAC),
            tvmValidExecutors: this.TACParams.trustedTONExecutors,
            toBridge: assets
                .filter(
                    (asset): asset is RawAssetBridgingData<WithAddressNFTCollectionItem> & WithAddressFT =>
                        asset.type === AssetType.FT,
                )
                .map((asset) => ({
                    evmAddress: asset.address!,
                    amount: asset.rawAmount,
                })),
            toBridgeNFT: assets
                .filter(
                    (
                        asset,
                    ): asset is RawAssetBridgingData<WithAddressNFTCollectionItem> & WithAddressNFTCollectionItem =>
                        asset.type === AssetType.NFT,
                )
                .map((asset) => ({
                    evmAddress: asset.collectionAddress,
                    amount: 1n,
                    tokenId: asset.itemIndex,
                })),
        };

        const encodedOutMessage = this.artifacts.tac.utils.encodeOutMessageV1(outMessage);
        const outMsgVersion = 1n;

        const totalValue = value + BigInt(outMessage.tvmProtocolFee) + BigInt(outMessage.tvmExecutorFee);
        this.debugLog(`Total value: ${totalValue}`);

        const tx = await this.TACParams.crossChainLayer
            .connect(signer)
            .sendMessage(outMsgVersion, encodedOutMessage, { value: totalValue });
        await tx.wait();
        this.debugLog(`Transaction hash: ${tx.hash}`);
        return tx.hash;
    }

    get getTrustedTACExecutors(): string[] {
        return this.TACParams.trustedTACExecutors;
    }

    get getTrustedTONExecutors(): string[] {
        return this.TACParams.trustedTONExecutors;
    }

    async getEVMTokenAddress(tvmTokenAddress: string): Promise<string> {
        this.debugLog(`Getting EVM token address for ${tvmTokenAddress}`);
        if (tvmTokenAddress !== this.nativeTONAddress) {
            validateTVMAddress(tvmTokenAddress);
            tvmTokenAddress = Address.parse(tvmTokenAddress).toString({ bounceable: true });

            const { code: givenMinterCodeBOC } = await this.TONParams.contractOpener.getContractState(
                address(tvmTokenAddress),
            );
            await sleep(this.delay * 1000);

            if (givenMinterCodeBOC && this.TONParams.jettonMinterCode.equals(Cell.fromBoc(givenMinterCodeBOC)[0])) {
                this.debugLog(`Computing EVM token address using jetton minter`);
                const givenMinter = this.TONParams.contractOpener.open(new JettonMaster(address(tvmTokenAddress)));
                const evmAddress = await givenMinter.getEVMAddress();
                await sleep(this.delay * 1000);
                return evmAddress;
            }
        }

        this.debugLog(`Computing EVM token address using token utils`);
        return this.TACParams.tokenUtils.computeAddress(tvmTokenAddress);
    }

    async getTVMTokenAddress(evmTokenAddress: string): Promise<string> {
        this.debugLog(`Getting TVM token address for ${evmTokenAddress}`);
        validateEVMAddress(evmTokenAddress);

        const exists = await this.TACParams.tokenUtils['exists(address)'](evmTokenAddress);

        if (exists) {
            this.debugLog(`Getting TVM token address using cross chain layer ERC20 factory`);
            const erc721Token = this.artifacts.tac.wrappers.CrossChainLayerERC20FactoryTAC.connect(
                evmTokenAddress,
                this.TACParams.provider,
            );

            const info = await erc721Token.getInfo();
            return info.tvmAddress;
        }

        this.debugLog(`Getting TVM token address using jetton minter`);
        const jettonMaster = JettonMaster.createFromConfig({
            evmTokenAddress,
            crossChainLayerAddress: address(this.TONParams.crossChainLayerAddress),
            code: this.TONParams.jettonMinterCode,
            walletCode: this.TONParams.jettonWalletCode,
        });

        return jettonMaster.address.toString();
    }

    async getTVMNFTAddress(evmNFTAddress: string, tokenId?: number | bigint): Promise<string> {
        this.debugLog(`Getting TVM NFT ${tokenId ? `item ${tokenId}` : 'collection'} address for ${evmNFTAddress}`);
        validateEVMAddress(evmNFTAddress);

        let nftCollection: OpenedContract<NFTCollection> | SandboxContract<NFTCollection>;

        const exists = await this.TACParams.tokenUtils['exists(address)'](evmNFTAddress);

        if (exists) {
            this.debugLog(`Getting TVM NFT address using cross chain layer ERC721 factory`);
            const erc721Token = this.artifacts.tac.wrappers.CrossChainLayerERC721FactoryTAC.connect(
                evmNFTAddress,
                this.TACParams.provider,
            );

            const info = await erc721Token.getInfo();
            nftCollection = this.TONParams.contractOpener.open(
                NFTCollection.createFromAddress(address(info.tvmAddress)),
            );

            return tokenId == undefined
                ? nftCollection.address.toString()
                : (await nftCollection.getNFTAddressByIndex(tokenId)).toString();
        } else {
            this.debugLog(`Getting TVM NFT address using TON NFT collection contract`);
            nftCollection = this.TONParams.contractOpener.open(
                NFTCollection.createFromConfig(
                    {
                        ownerAddress: address(this.TONParams.crossChainLayerAddress),
                        content: beginCell().endCell(),
                        nftItemCode: this.TONParams.nftItemCode,
                        originalAddress: evmNFTAddress,
                    },
                    this.TONParams.nftCollectionCode,
                ),
            );

            return tokenId == undefined
                ? nftCollection.address.toString()
                : NFTItem.createFromConfig(
                      {
                          collectionAddress: nftCollection.address,
                          cclAddress: address(this.TONParams.crossChainLayerAddress),
                          // @ts-expect-error // bigint can be used, wrapper is not typed properly
                          index: tokenId,
                      },
                      this.TONParams.nftItemCode,
                  ).address.toString();
        }
    }

    async getEVMNFTAddress(tvmNFTAddress: string, addressType: NFTAddressType): Promise<string> {
        this.debugLog(`Getting EVM NFT address for ${tvmNFTAddress}`);
        validateTVMAddress(tvmNFTAddress);
        tvmNFTAddress = Address.parse(tvmNFTAddress).toString({ bounceable: true });

        if (addressType == NFTAddressType.ITEM) {
            this.debugLog(`Retrieving collection address for item ${tvmNFTAddress}`);
            tvmNFTAddress = (await this.getNFTItemData(tvmNFTAddress)).collectionAddress.toString();
            this.debugLog(`Collection address: ${tvmNFTAddress}`);
            addressType = NFTAddressType.COLLECTION;
            await sleep(this.delay * 1000);
        }

        const { code: givenNFTCollection } = await this.TONParams.contractOpener.getContractState(
            address(tvmNFTAddress),
        );
        await sleep(this.delay * 1000);

        if (givenNFTCollection && this.TONParams.nftCollectionCode.equals(Cell.fromBoc(givenNFTCollection)[0])) {
            this.debugLog(`Getting EVM NFT address using TON NFT collection contract`);
            const nftCollection = this.TONParams.contractOpener.open(
                NFTCollection.createFromAddress(address(tvmNFTAddress)),
            );
            const evmAddress = await nftCollection.getOriginalAddress();
            await sleep(this.delay * 1000);
            return evmAddress.toString();
        }

        this.debugLog(`Computing EVM NFT address using token utils`);
        return this.TACParams.tokenUtils.computeAddressERC721(tvmNFTAddress);
    }

    async isContractDeployedOnTVM(address: string): Promise<boolean> {
        return (await this.TONParams.contractOpener.getContractState(Address.parse(address))).state === 'active';
    }

    async simulateTACMessage(req: TACSimulationRequest): Promise<TACSimulationResult> {
        this.debugLog('Simulating TAC message');
        let lastError;
        for (const endpoint of this.liteSequencerEndpoints) {
            try {
                const response = await axios.post<TACSimulationResponse>(
                    new URL('tac/simulator/simulate-message', endpoint).toString(),
                    req,
                    {
                        transformResponse: [toCamelCaseTransformer],
                    },
                );

                this.debugLog('TAC message simulation success');
                return response.data.response;
            } catch (error) {
                this.debugLog(`Error while simulating with ${endpoint}: ${error}`);
                lastError = error;
            }
        }
        throw simulationError(lastError);
    }
}
