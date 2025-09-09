import { Address } from '@ton/ton';
import { mainnet, testnet } from '@tonappchain/artifacts';
import { ethers, keccak256, toUtf8Bytes } from 'ethers';

import { createDefaultRetryableOpener } from '../adapters/retryableContractOpener';
import { IConfiguration } from '../interfaces';
import { InternalTACParams, InternalTONParams } from '../structs/InternalStruct';
import { Network, TACParams, TONParams } from '../structs/Struct';
import { Settings } from '../wrappers/Settings';
import { Validator } from './Validator';

export class Configuration implements IConfiguration {
    readonly network: Network;
    readonly artifacts: typeof testnet | typeof mainnet;
    readonly TONParams: InternalTONParams;
    readonly TACParams: InternalTACParams;
    readonly liteSequencerEndpoints: string[];

    constructor(
        network: Network,
        artifacts: typeof testnet | typeof mainnet,
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
        artifacts: typeof testnet | typeof mainnet,
        TONParams?: TONParams,
        TACParams?: TACParams,
        customLiteSequencerEndpoints?: string[],
        delay?: number,
    ): Promise<Configuration> {
        const internalTONParams = await this.prepareTONParams(artifacts, TONParams, delay);
        const internalTACParams = await this.prepareTACParams(artifacts, TACParams);

        const liteSequencerEndpoints =
            customLiteSequencerEndpoints ??
            (network === Network.TESTNET
                ? testnet.PUBLIC_LITE_SEQUENCER_ENDPOINTS
                : mainnet.PUBLIC_LITE_SEQUENCER_ENDPOINTS);

        return new Configuration(network, artifacts, internalTONParams, internalTACParams, liteSequencerEndpoints);
    }

    private static async prepareTONParams(
        artifacts: typeof testnet | typeof mainnet,
        TONParams?: TONParams,
        delay?: number,
    ): Promise<InternalTONParams> {
        const contractOpener = TONParams?.contractOpener ?? (await createDefaultRetryableOpener(artifacts, 3, delay));
        const settingsAddress = TONParams?.settingsAddress ?? artifacts.TON_SETTINGS_ADDRESS;
        const settings = contractOpener.open(new Settings(Address.parse(settingsAddress)));

        const jettonProxyAddress = await settings.getAddressSetting('JettonProxyAddress');
        const crossChainLayerAddress = await settings.getAddressSetting('CrossChainLayerAddress');
        const jettonMinterCode = await settings.getCellSetting('JettonMinterCode');
        const jettonWalletCode = await settings.getCellSetting('JettonWalletCode');
        const nftProxyAddress = await settings.getAddressSetting('NFTProxyAddress');
        const nftItemCode = await settings.getCellSetting('NFTItemCode');
        const nftCollectionCode = await settings.getCellSetting('NFTCollectionCode');

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
        TACParams?: TACParams,
    ): Promise<InternalTACParams> {
        const provider = TACParams?.provider ?? ethers.getDefaultProvider(artifacts.TAC_RPC_ENDPOINT);

        const settingsAddress = TACParams?.settingsAddress?.toString() ?? artifacts.TAC_SETTINGS_ADDRESS;
        Validator.validateEVMAddress(settingsAddress);

        const settings = artifacts.tac.wrappers.SettingsFactoryTAC.connect(settingsAddress, provider);
        const crossChainLayerAddress = await settings.getAddressSetting(
            keccak256(toUtf8Bytes('CrossChainLayerAddress')),
        );
        const crossChainLayer = artifacts.tac.wrappers.CrossChainLayerFactoryTAC.connect(
            crossChainLayerAddress,
            provider,
        );

        const tokenUtilsAddress = await settings.getAddressSetting(keccak256(toUtf8Bytes('TokenUtilsAddress')));
        const tokenUtils = artifacts.tac.wrappers.TokenUtilsFactoryTAC.connect(tokenUtilsAddress, provider);

        const trustedTACExecutors = await settings.getTrustedEVMExecutors();
        const trustedTONExecutors = await settings.getTrustedTVMExecutors();

        return {
            provider,
            settings,
            tokenUtils,
            crossChainLayer,
            trustedTACExecutors,
            trustedTONExecutors,
            abiCoder: new ethers.AbiCoder(),
        };
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
