import { Address, Dictionary } from '@ton/ton';
import { dev, mainnet, testnet } from '../../artifacts';
import { ethers, keccak256, toUtf8Bytes } from 'ethers';

import { createDefaultRetryableOpener } from '../adapters/retryableContractOpener';
import { IConfiguration } from '../interfaces';
import { InternalTACParams, InternalTONParams } from '../structs/InternalStruct';
import { Network, TACParams, TONParams } from '../structs/Struct';
import { getAddressString, Settings } from '../wrappers/Settings';
import { sha256toBigInt } from './Utils';
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
            this.prepareTONParams(artifacts, TONParams, delay),
            this.prepareTACParams(artifacts, TACParams),
        ]);

        const liteSequencerEndpoints =
            customLiteSequencerEndpoints ??
            (network === Network.TESTNET
                ? testnet.PUBLIC_LITE_SEQUENCER_ENDPOINTS
                : mainnet.PUBLIC_LITE_SEQUENCER_ENDPOINTS);

        return new Configuration(network, artifacts, internalTONParams, internalTACParams, liteSequencerEndpoints);
    }

    private static async prepareTONParams(
        artifacts: typeof testnet | typeof mainnet | typeof dev,
        TONParams?: TONParams,
        delay?: number,
    ): Promise<InternalTONParams> {
        const contractOpener = TONParams?.contractOpener ?? (await createDefaultRetryableOpener(artifacts, 3, delay));
        const settingsAddress = TONParams?.settingsAddress ?? artifacts.TON_SETTINGS_ADDRESS;
        const settings = contractOpener.open(Settings.create(Address.parse(settingsAddress)));
        const allSettingsSlice = (await settings.getAll()).beginParse();
        const allSettings = allSettingsSlice.loadDictDirect(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell());

        const crossChainLayerAddress = getAddressString(allSettings.get(sha256toBigInt('CrossChainLayerAddress')));
        const jettonProxyAddress = getAddressString(allSettings.get(sha256toBigInt('JettonProxyAddress')));
        const nftProxyAddress = getAddressString(allSettings.get(sha256toBigInt('NFTProxyAddress')));
        const jettonWalletCode = allSettings.get(sha256toBigInt('JettonWalletCode'))!;
        const jettonMinterCode = allSettings.get(sha256toBigInt('JettonMinterCode'))!;
        const nftItemCode = allSettings.get(sha256toBigInt('NFTItemCode'))!;
        const nftCollectionCode = allSettings.get(sha256toBigInt('NFTCollectionCode'))!;

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
        artifacts: typeof testnet | typeof mainnet | typeof dev,
        TACParams?: TACParams,
    ): Promise<InternalTACParams> {
        const provider = TACParams?.provider ?? ethers.getDefaultProvider(artifacts.TAC_RPC_ENDPOINT);

        const settingsAddress = TACParams?.settingsAddress?.toString() ?? artifacts.TAC_SETTINGS_ADDRESS;
        Validator.validateEVMAddress(settingsAddress);

        const settings = artifacts.tac.wrappers.SettingsFactoryTAC.connect(settingsAddress, provider);

        const loaded = await this.loadSettingsViaMulticall(artifacts, provider, settingsAddress, TACParams);
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

        const crossChainLayer = artifacts.tac.wrappers.CrossChainLayerFactoryTAC.connect(
            crossChainLayerAddress,
            provider,
        );
        const tokenUtils = artifacts.tac.wrappers.TokenUtilsFactoryTAC.connect(tokenUtilsAddress, provider);
        const smartAccountFactory = artifacts.tac.wrappers.TacSAFactory_factoryTAC.connect(
            artifacts.TAC_SMART_ACCOUNT_FACTORY_ADDRESS,
            provider,
        );

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

    private static async loadSettingsViaMulticall(
        artifacts: typeof testnet | typeof mainnet | typeof dev,
        provider: ethers.AbstractProvider,
        settingsAddress: string,
        TACParams?: TACParams,
    ) {
        const multicallAddress = TACParams?.multicallAddress?.toString() ?? artifacts.MULTICALL_3_ADDRESS;
        const multicallAbi = TACParams?.multicallABI ?? artifacts.tac.multicall.MULTICALL_ABI_ETHERS;
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
}
