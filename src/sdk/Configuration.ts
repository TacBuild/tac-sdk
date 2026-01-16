import { Address, Dictionary } from '@ton/ton';
import { ethers, keccak256, toUtf8Bytes } from 'ethers';

import { dev, mainnet, testnet } from '../../artifacts';
import { ICrossChainLayer, ISAFactory, ISettings, ITokenUtils } from '../../artifacts/tacTypes';
import { createDefaultRetryableOpener } from '../adapters';
import { ContractOpener, IConfiguration } from '../interfaces';
import { InternalTACParams, InternalTONParams, TONFeesParams } from '../structs/InternalStruct';
import { Network, TACParams, TONParams } from '../structs/Struct';
import { getAddressString, sha256toBigInt } from './Utils';
import { Validator } from './Validator';

export class Configuration implements IConfiguration {
    readonly network: Network;
    readonly artifacts: typeof testnet | typeof mainnet | typeof dev;
    readonly TONParams: InternalTONParams;
    readonly TACParams: InternalTACParams;
    readonly liteSequencerEndpoints: string[];

    constructor(
        network: Network,
        artifacts: typeof testnet | typeof mainnet | typeof dev,
        TONParams: InternalTONParams,
        TACParams: InternalTACParams,
        liteSequencerEndpoints: string[],
    ) {
        this.network = network;
        this.artifacts = artifacts;
        this.TONParams = TONParams;
        this.TACParams = TACParams;
        this.liteSequencerEndpoints = liteSequencerEndpoints;
    }

    static async create(
        network: Network,
        artifacts: typeof testnet | typeof mainnet | typeof dev,
        TONParams?: TONParams,
        TACParams?: TACParams,
        customLiteSequencerEndpoints?: string[],
        delay?: number,
    ): Promise<Configuration> {
        const [internalTONParams, internalTACParams] = await Promise.all([
            this.prepareTONParams(network, TONParams, delay),
            this.prepareTACParams(network, TACParams),
        ]);

        let liteSequencerEndpoints;
        if (network === Network.DEV) {
            if (!customLiteSequencerEndpoints || customLiteSequencerEndpoints.length === 0) {
                throw new Error('For dev network, custom lite sequencer endpoints must be provided');
            }
            liteSequencerEndpoints = customLiteSequencerEndpoints;
        } else {
            liteSequencerEndpoints = customLiteSequencerEndpoints ?? artifacts.PUBLIC_LITE_SEQUENCER_ENDPOINTS;
        }

        return new Configuration(network, artifacts, internalTONParams, internalTACParams, liteSequencerEndpoints);
    }

    private static async prepareTONParams(
        network: Network,
        TONParams?: TONParams,
        delay?: number,
    ): Promise<InternalTONParams> {
        let contractOpener;
        let settingsAddress: string;
        const artifacts = network === Network.MAINNET ? mainnet : network === Network.TESTNET ? testnet : dev;
        if (network === Network.DEV) {
            if (!TONParams || !TONParams.contractOpener) {
                throw new Error('For dev network, a custom contract opener must be provided in TONParams');
            }
            contractOpener = TONParams.contractOpener;
            if (!TONParams.settingsAddress) {
                throw new Error('For dev network, a custom settings address must be provided in TONParams');
            }
            settingsAddress = TONParams.settingsAddress;
        } else {
            contractOpener =
                TONParams?.contractOpener ??
                (await createDefaultRetryableOpener(artifacts.TON_RPC_ENDPOINT_BY_TAC, network, 5, delay));
            settingsAddress = TONParams?.settingsAddress ?? artifacts.TON_SETTINGS_ADDRESS;
        }
        const settings = contractOpener.open(
            artifacts.ton.wrappers.Settings.createFromAddress(Address.parse(settingsAddress)),
        );
        const allSettingsSlice = (await settings.getAll()).beginParse();
        const allSettings = allSettingsSlice.loadDictDirect(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell());

        const crossChainLayerAddress = getAddressString(allSettings.get(sha256toBigInt('CrossChainLayerAddress')));
        const jettonProxyAddress = getAddressString(allSettings.get(sha256toBigInt('JettonProxyAddress')));
        const nftProxyAddress = getAddressString(allSettings.get(sha256toBigInt('NFTProxyAddress')));
        const jettonWalletCode = allSettings.get(sha256toBigInt('JettonWalletCode'))!;
        const jettonMinterCode = allSettings.get(sha256toBigInt('JettonMinterCode'))!;
        const nftItemCode = allSettings.get(sha256toBigInt('NFTItemCode'))!;
        const nftCollectionCode = allSettings.get(sha256toBigInt('NFTCollectionCode'))!;

        const feesParams = await this.retrieveTONFeesParams(contractOpener);

        return {
            contractOpener,
            jettonProxyAddress,
            crossChainLayerAddress,
            jettonMinterCode,
            jettonWalletCode,
            nftProxyAddress,
            nftItemCode,
            nftCollectionCode,
            feesParams,
        };
    }

    private static async prepareTACParams(network: Network, TACParams?: TACParams): Promise<InternalTACParams> {
        const artifacts = network === Network.MAINNET ? mainnet : network === Network.TESTNET ? testnet : dev;
        let provider: ethers.AbstractProvider;
        let settingsAddress: string;
        let saFactoryAddress: string;
        if (network === Network.DEV) {
            if (!TACParams || !TACParams.provider) {
                throw new Error('For dev network, a custom provider must be provided in TACParams');
            }
            provider = TACParams.provider;
            if (!TACParams.settingsAddress) {
                throw new Error('For dev network, a custom settings address must be provided in TACParams');
            }
            settingsAddress = TACParams.settingsAddress;
            if (!TACParams.saFactoryAddress) {
                throw new Error(
                    'For dev network, a custom smart account factory address must be provided in TACParams',
                );
            }
            saFactoryAddress = TACParams.saFactoryAddress;
        } else {
            provider = TACParams?.provider ?? ethers.getDefaultProvider(artifacts.TAC_RPC_ENDPOINT);
            settingsAddress = TACParams?.settingsAddress ?? artifacts.TAC_SETTINGS_ADDRESS;
            saFactoryAddress = TACParams?.saFactoryAddress ?? artifacts.TAC_SMART_ACCOUNT_FACTORY_ADDRESS;
        }

        Validator.validateEVMAddress(settingsAddress);

        const settingsAbi = artifacts.tac.compilationArtifacts.ISettings.abi;
        const settings = new ethers.Contract(settingsAddress, settingsAbi, provider) as unknown as ISettings;

        const loaded = await this.loadTACSettingsViaMulticall(network, provider, settingsAddress);
        let crossChainLayerAddress: string;
        let tokenUtilsAddress: string;
        let trustedTACExecutors: string[];
        let trustedTONExecutors: string[];

        if (loaded) {
            crossChainLayerAddress = loaded.crossChainLayerAddress;
            tokenUtilsAddress = loaded.tokenUtilsAddress;
            trustedTACExecutors = loaded.trustedTACExecutors;
            trustedTONExecutors = loaded.trustedTONExecutors;
        } else {
            crossChainLayerAddress = await settings.getAddressSetting(keccak256(toUtf8Bytes('CrossChainLayerAddress')));
            tokenUtilsAddress = await settings.getAddressSetting(keccak256(toUtf8Bytes('TokenUtilsAddress')));
            trustedTACExecutors = await settings.getTrustedEVMExecutors();
            trustedTONExecutors = await settings.getTrustedTVMExecutors();
        }

        const crossChainLayerAbi = artifacts.tac.compilationArtifacts.ICrossChainLayer.abi;
        const crossChainLayer = new ethers.Contract(
            crossChainLayerAddress,
            crossChainLayerAbi,
            provider,
        ) as unknown as ICrossChainLayer;

        const tokenUtilsAbi = artifacts.tac.compilationArtifacts.ITokenUtils.abi;
        const tokenUtils = new ethers.Contract(tokenUtilsAddress, tokenUtilsAbi, provider) as unknown as ITokenUtils;

        const TacSAFactoryAbi = artifacts.tac.compilationArtifacts.ISAFactory.abi;
        const smartAccountFactory = new ethers.Contract(
            saFactoryAddress,
            TacSAFactoryAbi,
            provider,
        ) as unknown as ISAFactory;

        return {
            provider,
            settings,
            tokenUtils,
            smartAccountFactory,
            crossChainLayer,
            trustedTACExecutors,
            trustedTONExecutors,
            abiCoder: new ethers.AbiCoder(),
        };
    }

    private static async loadTACSettingsViaMulticall(
        network: Network,
        provider: ethers.AbstractProvider,
        settingsAddress: string,
    ) {
        if (network === Network.DEV) {
            // skip multicall in dev, because it's not guaranteed that multicall contract is deployed
            return null;
        }

        const artifacts = network === Network.MAINNET ? mainnet : testnet;
        const multicallAddress = artifacts.MULTICALL_3_ADDRESS;
        const multicallAbi = artifacts.tac.multicall.MULTICALL_ABI_ETHERS;
        try {
            Validator.validateEVMAddress(multicallAddress);
            const multicall = new ethers.Contract(multicallAddress, multicallAbi, provider);
            const abiCoder = new ethers.AbiCoder();

            const selectorGetAddressSetting = ethers.id('getAddressSetting(bytes32)').slice(0, 10);
            const selectorGetTrustedEVMExecutors = ethers.id('getTrustedEVMExecutors()').slice(0, 10);
            const selectorGetTrustedTVMExecutors = ethers.id('getTrustedTVMExecutors()').slice(0, 10);

            const crossChainLayerKey = keccak256(toUtf8Bytes('CrossChainLayerAddress'));
            const tokenUtilsKey = keccak256(toUtf8Bytes('TokenUtilsAddress'));
            const encodeGetAddressSetting = (key: string) =>
                selectorGetAddressSetting + abiCoder.encode(['bytes32'], [key]).slice(2);

            const calls = [
                { target: settingsAddress, allowFailure: false, callData: encodeGetAddressSetting(crossChainLayerKey) },
                { target: settingsAddress, allowFailure: false, callData: encodeGetAddressSetting(tokenUtilsKey) },
                { target: settingsAddress, allowFailure: false, callData: selectorGetTrustedEVMExecutors },
                { target: settingsAddress, allowFailure: false, callData: selectorGetTrustedTVMExecutors },
            ];

            const results = (await multicall.aggregate3.staticCall(calls)) as {
                success: boolean;
                returnData: string;
            }[];

            if (results.some((result) => !result.success)) return null;

            return {
                crossChainLayerAddress: abiCoder.decode(['address'], results[0].returnData)[0] as string,
                tokenUtilsAddress: abiCoder.decode(['address'], results[1].returnData)[0] as string,
                trustedTACExecutors: abiCoder.decode(['address[]'], results[2].returnData)[0] as string[],
                trustedTONExecutors: abiCoder.decode(['string[]'], results[3].returnData)[0] as string[],
            };
        } catch {
            return null;
        }
    }

    get nativeTONAddress(): string {
        return 'NONE';
    }

    async nativeTACAddress(): Promise<string> {
        return this.TACParams.crossChainLayer.NATIVE_TOKEN_ADDRESS.staticCall();
    }

    get getTrustedTACExecutors(): string[] {
        return this.TACParams.trustedTACExecutors;
    }

    get getTrustedTONExecutors(): string[] {
        return this.TACParams.trustedTONExecutors;
    }

    closeConnections(): unknown {
        return this.TONParams.contractOpener.closeConnections?.();
    }

    async isContractDeployedOnTVM(address: string): Promise<boolean> {
        return (await this.TONParams.contractOpener.getContractState(Address.parse(address))).state === 'active';
    }

    private static async retrieveTONFeesParams(contractOpener: ContractOpener): Promise<TONFeesParams> {
        try {
            const config = await contractOpener.getConfig();

            const prices = {
                gasPrice: 0,
                lumpPrice: 0,
                msgBitPrice: 0,
                msgCellPrice: 0,
                ihrPriceFactor: 0,
                firstFrac: 0,
                accountBitPrice: 0,
                accountCellPrice: 0,
            };

            // ───────────────────────────────────────────────
            // Param 21 – Gas prices
            // ───────────────────────────────────────────────
            const param21 = config.get(21);
            if (!param21) throw new Error('Param 21 (gas prices) not found in config');

            let slice = param21.beginParse();
            slice.skip(8 + 64 + 64 + 8); // = 144 bits
            const gasPriceRaw = slice.loadUint(64);
            prices.gasPrice = gasPriceRaw / 65536;

            // ───────────────────────────────────────────────
            // Param 25 – Message forwarding prices
            // ───────────────────────────────────────────────
            const param25 = config.get(25);
            if (!param25) throw new Error('Param 25 (msg prices) not found in config');
            slice = param25.beginParse();
            slice.skip(8); // usually just flags / version

            prices.lumpPrice = slice.loadUint(64);
            prices.msgBitPrice = slice.loadUint(64);
            prices.msgCellPrice = slice.loadUint(64);
            prices.ihrPriceFactor = slice.loadUint(32);
            prices.firstFrac = slice.loadUint(16);

            // ───────────────────────────────────────────────
            // Param 18 – Storage prices
            // ───────────────────────────────────────────────
            const param18 = config.get(18);
            if (!param18) throw new Error('Param 18 (storage prices) not found in config');

            const dict = param18.beginParse().loadDictDirect(Dictionary.Keys.Uint(32), Dictionary.Values.Cell());

            const entry = await dict.get(0);
            if (!entry) throw new Error('Storage price entry for key 0 not found');
            slice = entry.beginParse();
            slice.skip(8 + 32);

            prices.accountBitPrice = slice.loadUint(64);
            prices.accountCellPrice = slice.loadUint(64);
            return prices;
        } catch {
            // return standard values from https://tonviewer.com/config#25 in case of failure
            return {
                accountBitPrice: 1,
                accountCellPrice: 500,
                lumpPrice: 400000,
                gasPrice: 400,
                firstFrac: 21845,
                ihrPriceFactor: 98304,
                msgBitPrice: 26214400,
                msgCellPrice: 2621440000,
            };
        }
    }
}
