import axios from 'axios';
import { Address, address, beginCell, Cell, toNano } from '@ton/ton';
import { Wallet, ethers, keccak256, toUtf8Bytes, isAddress as isEthereumAddress } from 'ethers';
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
    UserWalletBalanceExtended,
    TACSimulationResult,
    TACSimulationRequest,
    FeeParams,
    ValidExecutors,
    CrossChainTransactionOptions,
    ExecutionFeeEstimationResult,
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
    TACSimulationResponse,
} from '../structs/InternalStruct';
// jetton imports
import { JettonMaster } from '../wrappers/JettonMaster';
import { JettonWallet } from '../wrappers/JettonWallet';
// ton settings
import { Settings } from '../wrappers/Settings';
import { JETTON_TRANSFER_FORWARD_TON_AMOUNT, TRANSACTION_TON_AMOUNT, DEFAULT_DELAY } from './Consts';
import {
    buildEvmDataCell,
    calculateAmount,
    calculateContractAddress,
    calculateEVMTokenAddress,
    calculateRawAmount,
    generateRandomNumberByTimestamp,
    generateTransactionLinker,
    toCamelCaseTransformer,
    sleep,
    validateEVMAddress,
    validateTVMAddress,
    formatSolidityMethodName,
} from './Utils';
import { mainnet, testnet } from '@tonappchain/artifacts';
import { emptyContractError, simulationError } from '../errors';
import { orbsOpener4 } from '../adapters/contractOpener';

import { OutMessageV1Struct } from '@tonappchain/evm-ccl/dist/typechain-types/contracts/L2/Structs.sol/IStructsInterface';
import { encodeOutMessageV1 } from '@tonappchain/evm-ccl/dist/scripts/utils/merkleTreeUtils'; 

import { CrossChainLayer__factory as CrossChainLayerFactoryTAC } from '@tonappchain/evm-ccl/dist/typechain-types/factories/contracts/L2/CrossChainLayer__factory';
import { TokenUtils__factory as TokenUtilsFactoryTAC } from '@tonappchain/evm-ccl/dist/typechain-types/factories/contracts/L2/TokenUtils__factory';
import { Settings__factory as SettingsFactoryTAC } from '@tonappchain/evm-ccl/dist/typechain-types/factories/contracts/L2/Settings__factory';
import { ERC20__factory as ERC20FactoryTAC } from '@tonappchain/evm-ccl/dist/typechain-types/factories/@openzeppelin/contracts/token/ERC20/ERC20__factory';

export class TacSdk {
    readonly network: Network;
    readonly delay: number;
    readonly artifacts: typeof testnet | typeof mainnet;
    readonly TONParams: InternalTONParams;
    readonly TACParams: InternalTACParams;
    readonly liteSequencerEndpoints: string[];

    private constructor(
        network: Network,
        delay: number,
        artifacts: typeof testnet | typeof mainnet,
        TONParams: InternalTONParams,
        TACParams: InternalTACParams,
        liteSequencerEndpoints: string[],
    ) {
        this.network = network;
        this.delay = delay;
        this.artifacts = artifacts;
        this.TONParams = TONParams;
        this.TACParams = TACParams;
        this.liteSequencerEndpoints = liteSequencerEndpoints;
    }

    static async create(sdkParams: SDKParams): Promise<TacSdk> {
        const network = sdkParams.network;
        const delay = sdkParams.delay ?? DEFAULT_DELAY;
        const artifacts = network === Network.TESTNET ? testnet : mainnet;
        const TONParams = await this.prepareTONParams(network, delay, artifacts, sdkParams.TONParams);
        const TACParams = await this.prepareTACParams(artifacts, delay, sdkParams.TACParams);

        const liteSequencerEndpoints =
            sdkParams.customLiteSequencerEndpoints ??
            (network === Network.TESTNET
                ? testnet.PUBLIC_LITE_SEQUENCER_ENDPOINTS
                : mainnet.PUBLIC_LITE_SEQUENCER_ENDPOINTS);
        return new TacSdk(network, delay, artifacts, TONParams, TACParams, liteSequencerEndpoints);
    }

    private static async prepareTONParams(
        network: Network,
        delay: number,
        artifacts: typeof testnet | typeof mainnet,
        TONParams?: TONParams,
    ): Promise<InternalTONParams> {
        const contractOpener = TONParams?.contractOpener ?? (await orbsOpener4(network));
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
        artifacts: typeof testnet | typeof mainnet,
        delay: number,
        TACParams?: TACParams,
    ): Promise<InternalTACParams> {
        const provider = TACParams?.provider ?? ethers.getDefaultProvider(artifacts.TAC_RPC_ENDPOINT);

        const settingsAddress = TACParams?.settingsAddress?.toString() ?? artifacts.tac.addresses.TAC_SETTINGS_ADDRESS;

        const settings = SettingsFactoryTAC.connect(settingsAddress, provider);
        const crossChainLayerABI =
            TACParams?.crossChainLayerABI ?? artifacts.tac.compilationArtifacts.CrossChainLayer.abi;
        const crossChainLayerAddress = await settings.getAddressSetting(
            keccak256(toUtf8Bytes('CrossChainLayerAddress')),
        );
        const crossChainLayer = CrossChainLayerFactoryTAC.connect(crossChainLayerAddress, provider);
        await sleep(delay * 1000);

        const tokenUtilsAddress = await settings.getAddressSetting(keccak256(toUtf8Bytes('TokenUtilsAddress')));
        const tokenUtils = TokenUtilsFactoryTAC.connect(tokenUtilsAddress, provider);
        await sleep(delay * 1000);

        const trustedTACExecutors = await settings.getTrustedEVMExecutors();
        await sleep(delay * 1000);
        const trustedTONExecutors = await settings.getTrustedTVMExecutors();

        const crossChainLayerTokenABI =
            TACParams?.crossChainLayerTokenABI ?? artifacts.tac.compilationArtifacts.CrossChainLayerToken.abi;
        const crossChainLayerTokenBytecode =
            TACParams?.crossChainLayerTokenBytecode ?? artifacts.tac.compilationArtifacts.CrossChainLayerToken.bytecode;

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

    private getJettonBurnPayload(jettonData: JettonBurnData, evmData: Cell, crossChainTonAmount: bigint, feeData?: Cell): Cell {
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

    private generateFeeData(feeParams?: FeeParams): Cell | undefined {
        if (feeParams) {
            let feeDataBuilder = beginCell()
                    .storeBit(feeParams.isRoundTrip)
                    .storeCoins(feeParams.protocolFee)
                    .storeCoins(feeParams.evmExecutorFee);
            if (feeParams.isRoundTrip) {
                feeDataBuilder.storeCoins(feeParams.tvmExecutorFee);
            }
            return feeDataBuilder.endCell();
        } else {
            return undefined;
        }
    }

    private getTonTransferPayload(responseAddress: string, evmData: Cell, crossChainTonAmount: bigint, feeParams: FeeParams): Cell {
        const queryId = generateRandomNumberByTimestamp().randomNumber;
        const feeData = this.generateFeeData(feeParams);
        
        return beginCell()
            .storeUint(this.artifacts.ton.wrappers.CrossChainLayerOpCodes.anyone_l1MsgToL2, 32)
            .storeUint(queryId, 64)
            .storeUint(this.artifacts.ton.wrappers.OperationType.tonTransfer, 32)
            .storeCoins(crossChainTonAmount)
            .storeMaybeRef(feeData)
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
            return AssetOpType.JETTON_TRANSFER;
        }

        const givenMinter = this.TONParams.contractOpener.open(new JettonMaster(address(asset.address)));
        const l2Address = await givenMinter.getL2Address();
        await sleep(this.delay * 1000);

        const expectedMinterAddress = await calculateContractAddress(
            this.TONParams.jettonMinterCode,
            beginCell()
                .storeCoins(0)
                .storeAddress(address(this.TONParams.crossChainLayerAddress))
                .storeAddress(null)
                .storeRef(beginCell().endCell())
                .storeRef(this.TONParams.jettonWalletCode)
                .storeStringTail(l2Address)
                .endCell(),
        );

        if (!expectedMinterAddress.equals(givenMinter.address)) {
            return AssetOpType.JETTON_TRANSFER;
        }

        return AssetOpType.JETTON_BURN;
    }

    private async aggregateJettons(assets?: RawAssetBridgingData[]): Promise<{
        jettons: JettonBridgingData[];
        crossChainTonAmount: bigint;
    }> {
        const uniqueAssetsMap: Map<string, bigint> = new Map();
        let crossChainTonAmount = 0n;

        for await (const asset of assets ?? []) {
            if (asset.rawAmount <= 0) continue;

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
        }));

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
        forwardFeeTonAmount: bigint,
        feeParams?: FeeParams,
    ) {        
        const opType = await this.getJettonOpType(jetton);
        await sleep(this.delay * 1000);

        console.log(`***** Jetton ${jetton.address} requires ${opType} operation`);

        const feeData = this.generateFeeData(feeParams)

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
                payload = this.getJettonTransferPayload(jetton, caller, evmData, crossChainTonAmount, forwardFeeTonAmount, feeData);
                break;
        }

        return payload;
    }

    async getTACUSDPrice(): Promise<number> {
        return 0.5;
    }

    async getTONUSDPrice(): Promise<number> {
        return 5.5;
    }

    private async generateCrossChainMessages(
        caller: string,
        evmData: Cell,

        aggregatedData: {
            jettons: JettonBridgingData[];
            crossChainTonAmount: bigint;
        },

        feeParams: FeeParams,
    ): Promise<ShardMessage[]> {
        let crossChainTonAmount = aggregatedData.crossChainTonAmount;
        let feeTonAmount = feeParams.protocolFee + feeParams.evmExecutorFee + feeParams.tvmExecutorFee;

        if (aggregatedData.jettons.length == 0) {
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
            const payload = await this.generatePayload(jetton, caller, evmData, crossChainTonAmount, feeTonAmount, currentFeeParams);
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

        return messages;
    }

    private async getRawAmount(asset: AssetBridgingData, precalculatedAddress: string | undefined): Promise<bigint> {
        if ('rawAmount' in asset) {
            // User specified raw format amount
            return asset.rawAmount;
        }

        if (!precalculatedAddress) {
            // User specified TON Coin
            return toNano(asset.amount);
        }

        if (typeof asset.decimals === 'number') {
            // User manually set decimals
            return calculateRawAmount(asset.amount, asset.decimals);
        }

        // Get decimals from chain
        validateTVMAddress(precalculatedAddress);

        const contract = this.TONParams.contractOpener.open(new JettonMaster(address(precalculatedAddress)));
        const { content } = await contract.getJettonData();
        if (!content.metadata.decimals) {
            // if decimals not specified use default value 9
            return toNano(asset.amount);
        }

        return calculateRawAmount(asset.amount, Number(content.metadata.decimals));
    }

    private async convertAssetsToRawFormat(assets?: AssetBridgingData[]): Promise<RawAssetBridgingData[]> {
        return await Promise.all(
            (assets ?? []).map(async (asset) => {
                const address = isEthereumAddress(asset.address)
                    ? await this.getTVMTokenAddress(asset.address)
                    : asset.address;
                return {
                    address,
                    rawAmount: await this.getRawAmount(asset, address),
                };
            }),
        );
    }

    private async getFeeInfo(
        evmProxyMsg: EvmProxyMsg,
        transactionLinker: TransactionLinker,
        rawAssets: RawAssetBridgingData[],
        evmValidExecutors: string[],
        forceSend: boolean = false,
        isRoundTrip?: boolean,
    ): Promise<ExecutionFeeEstimationResult> {

        const crossChainLayer = this.TONParams.contractOpener.open(new this.artifacts.ton.wrappers.CrossChainLayer(Address.parse(this.TONParams.crossChainLayerAddress)));
        const fullStateCCL = await crossChainLayer.getFullData();
        
        const tacSimulationBody: TACSimulationRequest = {
            tacCallParams: {
                arguments: evmProxyMsg.encodedParameters ?? '0x',
                methodName: formatSolidityMethodName(evmProxyMsg.methodName),
                target: evmProxyMsg.evmTargetAddress,
            },
            evmValidExecutors: evmValidExecutors,
            extraData: '0x',
            feeAssetAddress: '',
            shardsKey: transactionLinker.shardsKey,
            tonAssets: rawAssets.map((asset) => ({
                amount: asset.rawAmount.toString(),
                tokenAddress: asset.address || '',
            })),
            tonCaller: transactionLinker.caller,
        };

        const tacSimulationResult = await this.simulateTACMessage(tacSimulationBody);
        if (!tacSimulationResult.simulationStatus) {
            if (forceSend) {
                return {
                    feeParams: {
                        isRoundTrip: isRoundTrip ?? false,
                        gasLimit: 0n,
                        protocolFee: BigInt(toNano(fullStateCCL.tacProtocolFee!)) + BigInt(isRoundTrip ?? false) * BigInt(toNano(fullStateCCL.tonProtocolFee!)),
                        evmExecutorFee: 0n,
                        tvmExecutorFee: 0n,
                    }, 
                    simulation: tacSimulationResult};
            }
            throw tacSimulationResult;
        }

        isRoundTrip = isRoundTrip ?? (tacSimulationResult.outMessages != null)

        const gasPriceGwei = BigInt(10n); // TODO request from node but it always returns null
        const gasLimit = (BigInt(tacSimulationResult.estimatedGas) * 120n) / 100n;

        const tacToTonRate = await this.getTACUSDPrice() / await this.getTONUSDPrice();
        const rateBigInt = BigInt(Math.floor(tacToTonRate * 1e9));
        
        const executorFeeInGwei = gasPriceGwei * gasLimit;
        const tacExecutorFeeInTON = executorFeeInGwei * rateBigInt / BigInt(10n ** 9n) + BigInt(tacSimulationResult.minExecutorFeeInTon); // no need to scale to TON because we calculate in gwei

        let tonExecutorFeeInTON = 0n;
        if (isRoundTrip == true) {
            tonExecutorFeeInTON = BigInt(tacSimulationResult.suggestedTonExecutionFee);
        }

        const protocolFee = BigInt(toNano(fullStateCCL.tacProtocolFee!)) + BigInt(isRoundTrip) * BigInt(toNano(fullStateCCL.tonProtocolFee!))

        const feeParams: FeeParams = {
            isRoundTrip: isRoundTrip,
            gasLimit: gasLimit,
            protocolFee: protocolFee,
            evmExecutorFee: tacExecutorFeeInTON,
            tvmExecutorFee: tonExecutorFeeInTON,
        }

        return {feeParams: feeParams, simulation: tacSimulationResult};
    }

    async getTransactionSimulationInfo(
        evmProxyMsg: EvmProxyMsg,
        sender: SenderAbstraction,
        assets?: AssetBridgingData[],
    ): Promise<ExecutionFeeEstimationResult> {
        const rawAssets = await this.convertAssetsToRawFormat(assets);
        const aggregatedData = await this.aggregateJettons(rawAssets);
        const transactionLinkerShardCount = aggregatedData.jettons.length == 0 ? 1 : aggregatedData.jettons.length;

        const transactionLinker = generateTransactionLinker(sender.getSenderAddress(), transactionLinkerShardCount);

        const evmValidExecutors = this.TACParams.trustedTACExecutors

        return await this.getFeeInfo(evmProxyMsg, transactionLinker, rawAssets, evmValidExecutors, false, undefined);
    }

    async sendCrossChainTransaction(
        evmProxyMsg: EvmProxyMsg,
        sender: SenderAbstraction,
        assets?: AssetBridgingData[],
        options?: CrossChainTransactionOptions,
    ): Promise<TransactionLinker> {
        let {
            forceSend = false,
            isRoundTrip = undefined,
            protocolFee = undefined,
            evmValidExecutors = [],
            evmExecutorFee = undefined,
            tvmValidExecutors = [],
            tvmExecutorFee = undefined
        } = options || {};
    
        const rawAssets = await this.convertAssetsToRawFormat(assets);
        const aggregatedData = await this.aggregateJettons(rawAssets);
        const transactionLinkerShardCount = aggregatedData.jettons.length == 0 ? 1 : aggregatedData.jettons.length;

        const caller = sender.getSenderAddress();
        const transactionLinker = generateTransactionLinker(caller, transactionLinkerShardCount);

        if (evmValidExecutors.length == 0) {
            evmValidExecutors = this.TACParams.trustedTACExecutors;
        }

        if (tvmValidExecutors.length == 0) {
            tvmValidExecutors = this.TACParams.trustedTONExecutors;
        }

        const {feeParams} = await this.getFeeInfo(evmProxyMsg, transactionLinker, rawAssets, evmValidExecutors, forceSend, isRoundTrip);

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

        const validExecutors: ValidExecutors = {
            tac: evmValidExecutors,
            ton: tvmValidExecutors,
        }

        const evmData = buildEvmDataCell(transactionLinker, evmProxyMsg, validExecutors);
        const messages = await this.generateCrossChainMessages(caller, evmData, aggregatedData, feeParams);
        await sleep(this.delay * 1000);

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

    // TODO move to sdk.TAC, sdk.TON
    async bridgeTokensToTON(
        signer: Wallet,
        value: bigint,
        tonTarget: string,
        assets?: RawAssetBridgingData[],
        tvmExecutorFee?: bigint,
    ): Promise<string> {
        if (assets == undefined) {
            assets = [];
        }
        const crossChainLayerAddress = await this.TACParams.crossChainLayer.getAddress();
        for (const asset of assets) {
            const tokenContract = ERC20FactoryTAC.connect(asset.address!, this.TACParams.provider);
    
            const tx = await tokenContract.connect(signer).approve(crossChainLayerAddress, asset.rawAmount);
            await tx.wait();
        }

        const shardsKey = BigInt(Math.round(Math.random() * 1e18));
        const protocolFee = await this.TACParams.crossChainLayer.getProtocolFee();

        let tvmExecutorFeeInTON = 0n;
        if (tvmExecutorFee != undefined) {
            tvmExecutorFeeInTON = tvmExecutorFee;
        } else {
            tvmExecutorFeeInTON = ((toNano("0.065") + toNano("0.05")) * BigInt(assets.length + 1 + Number(value != 0n)) + toNano("0.2")) * 120n / 100n; // TODO calc that
        }
        const tonToTacRate = await this.getTONUSDPrice() / await this.getTACUSDPrice();
        const scale = 10 ** 9;
        const tonToTacRateScaled = BigInt(Math.round(tonToTacRate * scale));
        const tvmExecutorFeeInTAC = tonToTacRateScaled * tvmExecutorFeeInTON;

        const outMessage: OutMessageV1Struct = {
            shardsKey: shardsKey,
            tvmTarget: tonTarget,
            tvmPayload: '',
            tvmProtocolFee: protocolFee,
            tvmExecutorFee: tvmExecutorFeeInTAC,
            tvmValidExecutors: this.TACParams.trustedTONExecutors,
            toBridge: assets.map(asset => ({
                l2Address: asset.address!,
                amount: asset.rawAmount,
              })),
        };

        const encodedOutMessage = encodeOutMessageV1(outMessage);
        const outMsgVersion = 1n;

        const totalValue = value + BigInt(outMessage.tvmProtocolFee) + BigInt(outMessage.tvmExecutorFee);

        const tx = await this.TACParams.crossChainLayer.connect(signer).sendMessage(outMsgVersion, encodedOutMessage, { value: totalValue });
        await tx.wait();
        return tx.hash;
    }

    get getTrustedTACExecutors(): string[] {
        return this.TACParams.trustedTACExecutors;
    }

    get getTrustedTONExecutors(): string[] {
        return this.TACParams.trustedTONExecutors;
    }

    async getEVMTokenAddress(tvmTokenAddress: string): Promise<string> {
        if (tvmTokenAddress !== this.nativeTONAddress) {
            validateTVMAddress(tvmTokenAddress);
            tvmTokenAddress = Address.parse(tvmTokenAddress).toString({ bounceable: true });

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
            await this.TACParams.tokenUtils.getAddress(),
            this.TACParams.crossChainLayerTokenBytecode,
            await this.TACParams.crossChainLayer.getAddress(),
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

    async simulateTACMessage(req: TACSimulationRequest): Promise<TACSimulationResult> {
        for (const endpoint of this.liteSequencerEndpoints) {
            try {
                const response = await axios.post<TACSimulationResponse>(
                    `${endpoint}/tac/simulator/simulate-message`,
                    req,
                    {
                        transformResponse: [toCamelCaseTransformer],
                    },
                );

                return response.data.response;
            } catch (error) {
                console.error(`Error while simulating with ${endpoint}:`, error);
            }
        }
        throw simulationError;
    }
}
