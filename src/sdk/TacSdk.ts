import { Address, address, beginCell, Cell, toNano } from '@ton/ton';
import { ethers, keccak256, toUtf8Bytes, isAddress as isEthereumAddress } from 'ethers';
import type { SenderAbstraction } from '../sender';
// import structs
import {
    AssetBridgingData,
    EvmProxyMsg,
    Network,
    SDKParams,
    TransactionLinker,
    TONParams,
    TACParams,
    RawAssetBridgingData,
} from '../structs/Struct';
// import internal structs
import {
    InternalTONParams,
    InternalTACParams,
    JettonBridgingData,
    JettonBurnData,
    JettonTransferData,
    AssetOpType,
    ShardMessage,
    ShardTransaction,
} from '../structs/InternalStruct';
// jetton imports
import { JettonMaster } from '../wrappers/JettonMaster';
import { JettonWallet } from '../wrappers/JettonWallet';
// ton settings
import { Settings } from '../wrappers/Settings';
import {
    JETTON_TRANSFER_FORWARD_TON_AMOUNT,
    MAINNET_TAC_RPC_ENDPOINT,
    TESTNET_TAC_RPC_ENDPOINT,
    TRANSACTION_TON_AMOUNT,
    DEFAULT_DELAY,
} from './Consts';
import {
    buildEvmDataCell,
    calculateContractAddress,
    calculateEVMTokenAddress,
    generateRandomNumberByTimestamp,
    generateTransactionLinker,
    sleep,
    validateEVMAddress,
    validateTVMAddress,
} from './Utils';
import { mainnet, testnet } from '@tonappchain/artifacts';
import { emptyContractError } from '../errors';
import { orbsOpener } from '../adapters/contractOpener';

export class TacSdk {
    readonly network: Network;
    readonly delay: number;
    readonly artifacts: typeof testnet | typeof mainnet;
    readonly TONParams: InternalTONParams;
    readonly TACParams: InternalTACParams;

    private constructor(
        network: Network,
        delay: number,
        artifacts: typeof testnet | typeof mainnet,
        TONParams: InternalTONParams,
        TACParams: InternalTACParams,
    ) {
        this.network = network;
        this.delay = delay;
        this.artifacts = artifacts;
        this.TONParams = TONParams;
        this.TACParams = TACParams;
    }

    static async create(sdkParams: SDKParams): Promise<TacSdk> {
        const network = sdkParams.network;
        const delay = sdkParams.delay ?? DEFAULT_DELAY;
        const artifacts = network === Network.Testnet ? testnet : mainnet;
        const TONParams = await this.prepareTONParams(network, delay, artifacts, sdkParams.TONParams);
        const TACParams = await this.prepareTACParams(network, artifacts, sdkParams.TACParams);
        return new TacSdk(network, delay, artifacts, TONParams, TACParams);
    }

    private static async prepareTONParams(
        network: Network,
        delay: number,
        artifacts: typeof testnet | typeof mainnet,
        TONParams?: TONParams,
    ): Promise<InternalTONParams> {
        const contractOpener = TONParams?.contractOpener ?? (await orbsOpener(network));
        const settingsAddress = TONParams?.settingsAddress ?? artifacts.ton.addresses.TON_SETTINGS_ADDRESS;
        const settings = contractOpener.open(new Settings(Address.parse(settingsAddress)));

        const jettonProxyAddress = await settings.getAddressSetting('JettonProxyAddress');
        await sleep(delay * 1000);
        const crossChainLayerAddress = await settings.getAddressSetting('CrossChainLayerAddress');
        await sleep(delay * 1000);
        const jettonMinterCode = await settings.getCellSetting('JETTON_MINTER_CODE');
        await sleep(delay * 1000);
        const jettonWalletCode = await settings.getCellSetting('JETTON_WALLET_CODE');
        await sleep(delay * 1000);

        return {
            contractOpener,
            jettonProxyAddress,
            crossChainLayerAddress,
            jettonMinterCode,
            jettonWalletCode,
        };
    }

    private static async prepareTACParams(
        network: Network,
        artifacts: typeof testnet | typeof mainnet,
        TACParams?: TACParams,
    ): Promise<InternalTACParams> {
        const provider =
            TACParams?.provider ??
            ethers.getDefaultProvider(
                network === Network.Testnet ? TESTNET_TAC_RPC_ENDPOINT : MAINNET_TAC_RPC_ENDPOINT,
            );

        const settingsAddress = TACParams?.settingsAddress?.toString() ?? artifacts.tac.addresses.TAC_SETTINGS_ADDRESS;
        const settings = new ethers.Contract(
            settingsAddress,
            TACParams?.settingsABI ?? artifacts.tac.compilationArtifacts.Settings.abi,
            provider,
        );

        const crossChainLayerABI =
            TACParams?.crossChainLayerABI ?? artifacts.tac.compilationArtifacts.CrossChainLayer.abi;
        const crossChainLayerAddress = await settings.getAddressSetting(
            keccak256(toUtf8Bytes('CrossChainLayerAddress')),
        );

        const crossChainLayerTokenABI =
            TACParams?.crossChainLayerTokenABI ?? artifacts.tac.compilationArtifacts.CrossChainLayerToken.abi;
        const crossChainLayerTokenBytecode =
            TACParams?.crossChainLayerTokenBytecode ?? artifacts.tac.compilationArtifacts.CrossChainLayerToken.bytecode;

        return {
            provider,
            settingsAddress,
            abiCoder: new ethers.AbiCoder(),
            crossChainLayerABI,
            crossChainLayerAddress,
            crossChainLayerTokenABI,
            crossChainLayerTokenBytecode,
        };
    }

    closeConnections(): unknown {
        return this.TONParams.contractOpener.closeConnections?.call(this);
    }

    get nativeTONAddress(): string {
        return 'NONE';
    }

    get nativeTACAddress(): Promise<string> {
        const crossChainLayer = new ethers.Contract(
            this.TACParams.crossChainLayerAddress,
            this.TACParams.crossChainLayerABI,
            this.TACParams.provider,
        );
        return crossChainLayer.NATIVE_TOKEN_ADDRESS.staticCall();
    }

    async getUserJettonWalletAddress(userAddress: string, tokenAddress: string): Promise<string> {
        const jettonMaster = this.TONParams.contractOpener.open(new JettonMaster(Address.parse(tokenAddress)));
        return await jettonMaster.getWalletAddress(userAddress);
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

    private getJettonTransferPayload(
        jettonData: JettonTransferData,
        responseAddress: string,
        evmData: Cell,
        crossChainTonAmount: bigint,
    ): Cell {
        const queryId = generateRandomNumberByTimestamp().randomNumber;
        return JettonWallet.transferMessage(
            jettonData.amountWithDecimals,
            this.TONParams.jettonProxyAddress,
            responseAddress,
            JETTON_TRANSFER_FORWARD_TON_AMOUNT,
            crossChainTonAmount,
            evmData,
            queryId,
        );
    }

    private getJettonBurnPayload(jettonData: JettonBurnData, evmData: Cell, crossChainTonAmount: bigint): Cell {
        const queryId = generateRandomNumberByTimestamp().randomNumber;
        return JettonWallet.burnMessage(
            jettonData.amountWithDecimals,
            jettonData.notificationReceiverAddress,
            crossChainTonAmount,
            evmData,
            queryId,
        );
    }

    private getTonTransferPayload(responseAddress: string, evmData: Cell, crossChainTonAmount: bigint): Cell {
        const queryId = generateRandomNumberByTimestamp().randomNumber;
        return beginCell()
            .storeUint(this.artifacts.ton.wrappers.CrossChainLayerOpCodes.anyone_l1MsgToL2, 32)
            .storeUint(queryId, 64)
            .storeUint(this.artifacts.ton.wrappers.OperationType.tonTransfer, 32)
            .storeCoins(crossChainTonAmount)
            .storeAddress(Address.parse(responseAddress))
            .storeMaybeRef(evmData)
            .endCell();
    }

    private async getJettonOpType(asset: JettonBridgingData): Promise<AssetOpType> {
        const { code: givenMinterCodeBOC } = await this.TONParams.contractOpener.getContractState(
            address(asset.address),
        );
        if (!givenMinterCodeBOC) {
            throw emptyContractError;
        }
        const givenMinterCode = Cell.fromBoc(givenMinterCodeBOC)[0];
        await sleep(this.delay * 1000);

        if (!this.TONParams.jettonMinterCode.equals(givenMinterCode)) {
            return AssetOpType.JettonTransfer;
        }

        const givenMinter = this.TONParams.contractOpener.open(new JettonMaster(address(asset.address)));
        const l2Address = await givenMinter.getL2Address();
        await sleep(this.delay * 1000);

        const expectedMinterAddress = await calculateContractAddress(
            this.TONParams.jettonMinterCode,
            beginCell()
                .storeCoins(0)
                .storeAddress(address(this.TONParams.crossChainLayerAddress))
                .storeRef(beginCell().endCell())
                .storeRef(this.TONParams.jettonWalletCode)
                .storeStringTail(l2Address)
                .endCell(),
        );

        if (!expectedMinterAddress.equals(givenMinter.address)) {
            return AssetOpType.JettonTransfer;
        }

        return AssetOpType.JettonBurn;
    }

    private async aggregateJettons(assets?: RawAssetBridgingData[]): Promise<{
        jettons: JettonBridgingData[];
        crossChainTonAmount: bigint;
    }> {
        const uniqueAssetsMap: Map<string, bigint> = new Map();
        let crossChainTonAmount = 0n;

        for await (const asset of assets ?? []) {
            if (asset.amountWithDecimals <= 0) continue;

            if (asset.address) {
                validateTVMAddress(asset.address);

                uniqueAssetsMap.set(
                    asset.address,
                    (uniqueAssetsMap.get(asset.address) || 0n) + BigInt(asset.amountWithDecimals),
                );
            } else {
                crossChainTonAmount += BigInt(asset.amountWithDecimals);
            }
        }
        const jettons: JettonBridgingData[] = Array.from(uniqueAssetsMap.entries()).map(
            ([address, amountWithDecimals]) => ({
                address,
                amountWithDecimals,
            }),
        );

        return {
            jettons,
            crossChainTonAmount,
        };
    }

    private async generatePayload(
        jetton: JettonBridgingData,
        caller: string,
        evmData: Cell,
        crossChainTonAmount: bigint,
    ) {
        const opType = await this.getJettonOpType(jetton);
        await sleep(this.delay * 1000);
        console.log(`***** Jetton ${jetton.address} requires ${opType} operation`);

        let payload: Cell;
        switch (opType) {
            case AssetOpType.JettonBurn:
                payload = this.getJettonBurnPayload(
                    {
                        notificationReceiverAddress: this.TONParams.crossChainLayerAddress,
                        ...jetton,
                    },
                    evmData,
                    crossChainTonAmount,
                );
                break;
            case AssetOpType.JettonTransfer:
                payload = this.getJettonTransferPayload(jetton, caller, evmData, crossChainTonAmount);
                break;
        }

        return payload;
    }

    private async generateCrossChainMessages(
        caller: string,
        evmData: Cell,
        aggregatedData: {
            jettons: JettonBridgingData[];
            crossChainTonAmount: bigint;
        },
    ): Promise<ShardMessage[]> {
        let crossChainTonAmount = aggregatedData.crossChainTonAmount;

        if (aggregatedData.jettons.length == 0) {
            return [
                {
                    address: this.TONParams.crossChainLayerAddress,
                    value: crossChainTonAmount + TRANSACTION_TON_AMOUNT,
                    payload: this.getTonTransferPayload(caller, evmData, crossChainTonAmount),
                },
            ];
        }

        const messages: ShardMessage[] = [];
        for (const jetton of aggregatedData.jettons) {
            const payload = await this.generatePayload(jetton, caller, evmData, crossChainTonAmount);
            const jettonWalletAddress = await this.getUserJettonWalletAddress(caller, jetton.address);
            await sleep(this.delay * 1000);

            messages.push({
                address: jettonWalletAddress,
                value: crossChainTonAmount + TRANSACTION_TON_AMOUNT,
                payload,
            });

            crossChainTonAmount = 0n;
        }

        return messages;
    }

    private async getRawAmount(
        asset: AssetBridgingData,
        precalculatedAddress: string | undefined,
    ): Promise<number | bigint> {
        if ('amountWithDecimals' in asset) {
            // User specified raw format amount
            return asset.amountWithDecimals;
        }

        if (!precalculatedAddress) {
            // User specified TON Coin
            return toNano(asset.amountWithoutDecimals);
        }

        if (typeof asset.decimals === 'number') {
            // User manually set decimals
            return BigInt(asset.amountWithoutDecimals) * 10n ** BigInt(asset.decimals);
        }

        // Get decimals from chain
        validateTVMAddress(precalculatedAddress);

        const contract = this.TONParams.contractOpener.open(new JettonMaster(address(precalculatedAddress)));
        const { content } = await contract.getJettonData();
        if (!content.metadata.decimals) {
            // if decimals not specified use default value 9
            return toNano(asset.amountWithoutDecimals);
        }

        return BigInt(asset.amountWithoutDecimals) * 10n ** BigInt(content.metadata.decimals);
    }

    private async convertAssetsToRawFormat(assets?: AssetBridgingData[]): Promise<RawAssetBridgingData[]> {
        return await Promise.all(
            (assets ?? []).map(async (asset) => {
                const address = isEthereumAddress(asset.address)
                    ? await this.getTVMTokenAddress(asset.address)
                    : asset.address;
                return {
                    address,
                    amountWithDecimals: await this.getRawAmount(asset, address),
                };
            }),
        );
    }

    async sendCrossChainTransaction(
        evmProxyMsg: EvmProxyMsg,
        sender: SenderAbstraction,
        assets?: AssetBridgingData[],
    ): Promise<TransactionLinker> {
        const rawAssets = await this.convertAssetsToRawFormat(assets);
        const aggregatedData = await this.aggregateJettons(rawAssets);
        const transactionLinkerShardCount = aggregatedData.jettons.length == 0 ? 1 : aggregatedData.jettons.length;

        const caller = sender.getSenderAddress();
        const transactionLinker = generateTransactionLinker(caller, transactionLinkerShardCount);
        const evmData = buildEvmDataCell(transactionLinker, evmProxyMsg);

        const messages = await this.generateCrossChainMessages(caller, evmData, aggregatedData);
        const transaction: ShardTransaction = {
            validUntil: +new Date() + 15 * 60 * 1000,
            messages,
            network: this.network,
        };

        console.log('*****Sending transaction: ', transaction);
        const sendTransactionResult = await sender.sendShardTransaction(
            transaction,
            this.delay,
            this.network,
            this.TONParams.contractOpener,
        );
        return { sendTransactionResult, ...transactionLinker };
    }

    async getEVMTokenAddress(tvmTokenAddress: string): Promise<string> {
        if (tvmTokenAddress !== this.nativeTONAddress) {
            validateTVMAddress(tvmTokenAddress);

            const { code: givenMinterCodeBOC } = await this.TONParams.contractOpener.getContractState(
                address(tvmTokenAddress),
            );
            await sleep(this.delay * 1000);

            if (givenMinterCodeBOC && this.TONParams.jettonMinterCode.equals(Cell.fromBoc(givenMinterCodeBOC)[0])) {
                const givenMinter = this.TONParams.contractOpener.open(new JettonMaster(address(tvmTokenAddress)));
                const l2Address = await givenMinter.getL2Address();
                await sleep(this.delay * 1000);
                return l2Address;
            }
        }

        return calculateEVMTokenAddress(
            this.TACParams.abiCoder,
            this.TACParams.crossChainLayerAddress,
            this.TACParams.crossChainLayerTokenBytecode,
            this.TACParams.settingsAddress,
            tvmTokenAddress,
        );
    }

    async getTVMTokenAddress(evmTokenAddress: string): Promise<string> {
        validateEVMAddress(evmTokenAddress);

        const bytecode = await this.TACParams.provider.getCode(evmTokenAddress);

        if (bytecode.includes(ethers.id('getInfo()').slice(2, 10))) {
            const contract = new ethers.Contract(
                evmTokenAddress,
                this.TACParams.crossChainLayerTokenABI,
                this.TACParams.provider,
            );
            const info = await contract.getInfo.staticCall();
            return info.l1Address;
        }

        const jettonMaster = JettonMaster.createFromConfig({
            evmTokenAddress,
            crossChainLayerAddress: address(this.TONParams.crossChainLayerAddress),
            code: this.TONParams.jettonMinterCode,
            walletCode: this.TONParams.jettonWalletCode,
        });

        return jettonMaster.address.toString();
    }
}
