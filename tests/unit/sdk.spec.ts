import '@ton/test-utils';

import { address, beginCell, Cell, Dictionary, toNano } from '@ton/core';
import { Blockchain, BlockchainSnapshot, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { ethers } from 'ethers';
import { mnemonicNew } from 'ton-crypto';

import {
    AssetBridgingData,
    AssetType,
    EvmProxyMsg,
    Network,
    SenderFactory,
    TacSdk,
    wallets,
    WalletVersion,
} from '../../src';

import { testnet } from '@tonappchain/artifacts';
import { sandboxOpener } from '../../src/adapters/contractOpener';

describe('TacSDK', () => {
    const {
        CrossChainLayerCompiled,
        ExecutorCompiled,
        JettonMinterCompiled,
        JettonWalletCompiled,
        JettonProxyCompiled,
        SettingsCompiled,
        NFTCollectionCompiled,
        NFTItemCompiled,
    } = testnet.ton.compilationArtifacts;
    const { CrossChainLayer, CrossChainLayerOpCodes, JettonMinter, JettonProxy, Settings } = testnet.ton.wrappers;

    const CrossChainLayerCode = Cell.fromHex(CrossChainLayerCompiled.hex);
    const ExecutorCode = Cell.fromHex(ExecutorCompiled.hex);
    const JettonMinterCode = Cell.fromHex(JettonMinterCompiled.hex);
    const JettonWalletCode = Cell.fromHex(JettonWalletCompiled.hex);
    const JettonProxyCode = Cell.fromHex(JettonProxyCompiled.hex);
    const SettingsCode = Cell.fromHex(SettingsCompiled.hex);
    const NFTCollectionCode = Cell.fromHex(NFTCollectionCompiled.hex);
    const NFTItemCode = Cell.fromHex(NFTItemCompiled.hex);

    let blockchain: Blockchain;
    let initialState: BlockchainSnapshot;
    let sdk: TacSdk;

    // CCL
    let crossChainLayer: SandboxContract<testnet.ton.wrappers.CrossChainLayer>;
    let admin: SandboxContract<TreasuryContract>;
    let sequencerMultisig: SandboxContract<TreasuryContract>;
    let tacProtocolFee: number;
    let tonProtocolFee: number;
    let protocolFeeSupply: number;
    let epochDelay: number;
    let nextVotingTime: number;
    let currEpoch: number;
    let prevEpoch: number;
    let user: SandboxContract<TreasuryContract>;

    // JETTON PROXY
    let jettonProxy: SandboxContract<testnet.ton.wrappers.JettonProxy>;

    // SETTINGS
    let settings: SandboxContract<testnet.ton.wrappers.Settings>;

    // JETTON MINTER
    let jettonMinter: SandboxContract<testnet.ton.wrappers.JettonMinter>;

    const evmRandomAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
    const tvmRandomAddress = 'EQCsQSo54ajAorOfDUAM-RPdDJgs0obqyrNSEtvbjB7hh2oK';

    const deployCCL = async () => {
        crossChainLayer = blockchain.openContract(
            CrossChainLayer.createFromConfig(
                {
                    currEpoch,
                    prevEpoch,
                    adminAddress: admin.address.toString(),
                    executorCode: ExecutorCode,
                    tacProtocolFee,
                    tonProtocolFee,
                    protocolFeeSupply,
                    merkleRoots: [],
                    epochDelay,
                    nextVotingTime,
                    maxRootsSize: 10,
                    sequencerMultisigAddress: sequencerMultisig.address.toString(),
                },
                CrossChainLayerCode,
            ),
        );
        const deployResult = await crossChainLayer.sendDeploy(admin.getSender(), toNano('1'));
        expect(deployResult.transactions).toHaveTransaction({
            to: crossChainLayer.address,
            deploy: true,
            success: true,
        });
    };

    const deployJettonProxy = async () => {
        jettonProxy = blockchain.openContract(
            JettonProxy.createFromConfig(
                {
                    crossChainLayerAddress: crossChainLayer.address.toString(),
                    adminAddress: admin.address.toString(),
                },
                JettonProxyCode,
            ),
        );
        const deployResult = await jettonProxy.sendDeploy(admin.getSender(), toNano('1'));
        expect(deployResult.transactions).toHaveTransaction({
            to: jettonProxy.address,
            deploy: true,
            success: true,
        });
    };

    const getKeyFromString = (ContractName: string): bigint => {
        const hash = ethers.sha256(ethers.toUtf8Bytes(ContractName));
        return ethers.toBigInt(hash);
    };

    const deploySettings = async () => {
        settings = blockchain.openContract(
            Settings.createFromConfig(
                {
                    settings: Dictionary.empty(),
                    adminAddress: admin.address,
                },
                SettingsCode,
            ),
        );
        const deployResult = await settings.sendDeploy(admin.getSender(), toNano(0.05));
        expect(deployResult.transactions).toHaveTransaction({
            from: admin.address,
            to: settings.address,
            deploy: true,
            success: true,
        });

        await settings.sendSetValue(admin.getSender(), toNano(0.1), {
            key: getKeyFromString('JettonProxyAddress'),
            value: beginCell().storeAddress(jettonProxy.address).endCell(),
        });
        await settings.sendSetValue(admin.getSender(), toNano(0.1), {
            key: getKeyFromString('CrossChainLayerAddress'),
            value: beginCell().storeAddress(crossChainLayer.address).endCell(),
        });
        await settings.sendSetValue(admin.getSender(), toNano(0.1), {
            key: getKeyFromString('JettonMinterCode'),
            value: JettonMinterCode,
        });
        await settings.sendSetValue(admin.getSender(), toNano(0.1), {
            key: getKeyFromString('JettonWalletCode'),
            value: JettonWalletCode,
        });
        await settings.sendSetValue(admin.getSender(), toNano(0.1), {
            key: getKeyFromString('NFTCollectionCode'),
            value: NFTCollectionCode,
        });
        await settings.sendSetValue(admin.getSender(), toNano(0.1), {
            key: getKeyFromString('NFTItemCode'),
            value: NFTItemCode,
        });
    };

    const deployJettonMinter = async () => {
        jettonMinter = blockchain.openContract(
            JettonMinter.createFromConfig(
                {
                    adminAddress: crossChainLayer.address,
                    content: beginCell().endCell(),
                    jettonWalletCode: JettonWalletCode,
                    evmTokenAddress: '0x1234',
                    totalSupply: 0,
                },
                JettonMinterCode,
            ),
        );

        const deployResult = await jettonMinter.sendDeploy(admin.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: admin.address,
            to: jettonMinter.address,
            deploy: true,
            success: true,
        });
    };

    beforeAll(async () => {
        blockchain = await Blockchain.create();

        admin = await blockchain.treasury('admin');
        user = await blockchain.treasury('user');
        sequencerMultisig = await blockchain.treasury('sequencerMultisig');
        tacProtocolFee = 0.01;
        tonProtocolFee = 0.02;
        protocolFeeSupply = 0;
        epochDelay = 0;
        nextVotingTime = 0;
        nextVotingTime = 0;
        prevEpoch = 0;
        currEpoch = 0;

        await deployCCL();
        await deployJettonProxy();
        await deploySettings();
        await deployJettonMinter();

        sdk = await TacSdk.create({
            TONParams: {
                contractOpener: sandboxOpener(blockchain),
                settingsAddress: settings.address.toString(),
            },
            network: Network.TESTNET,
        });

        initialState = blockchain.snapshot();
    });

    afterEach(async () => {
        await blockchain.loadFrom(initialState);
    });

    it('everything should be deployed', async () => {
        expect((await blockchain.getContract(settings.address)).accountState!.type).toBe('active');
        expect((await blockchain.getContract(jettonMinter.address)).accountState!.type).toBe('active');
        expect((await blockchain.getContract(jettonProxy.address)).accountState!.type).toBe('active');
        expect((await blockchain.getContract(crossChainLayer.address)).accountState!.type).toBe('active');
    });

    it('should get valid user jetton wallet address', async () => {
        const addr = await sdk.getUserJettonWalletAddress(user.address.toString(), jettonMinter.address.toString());
        expect((await jettonMinter.getWalletAddress(user.address)).toString()).toBe(addr);
    });

    it('should get set jetton balance', async () => {
        const balance = await sdk.getUserJettonBalance(user.address.toString(), jettonMinter.address.toString());
        expect(balance).toBe(0n);
    });

    it('should create valid jetton bridging data from asset bridging data', async () => {
        const amountTokenForEVMAddress = 2;
        const decimalsForEVMAddress = 18;
        const amountTokenForTVMAddress = BigInt(3 * 10 ** 10); // decimals = 10
        const assets: AssetBridgingData[] = [
            {
                /** TON */
                amount: 1,
                type: AssetType.FT,
            },
            {
                /** ETH address */
                address: evmRandomAddress,
                amount: amountTokenForEVMAddress,
                decimals: decimalsForEVMAddress,
                type: AssetType.FT,
            },
            {
                /** TON address */
                address: tvmRandomAddress,
                rawAmount: amountTokenForTVMAddress,
                type: AssetType.FT,
            },
        ];

        const expectedTVMAddressForEVM = await sdk.getTVMTokenAddress(evmRandomAddress);

        const rawAssets = await sdk['convertAssetsToRawFormat'](assets);
        const jettonAssets = await sdk['aggregateTokens'](rawAssets);
        expect(jettonAssets.jettons.length).toBe(2);
        expect(jettonAssets.crossChainTonAmount).toBe(toNano(1));
        expect(jettonAssets.jettons).toContainEqual({ address: tvmRandomAddress, rawAmount: amountTokenForTVMAddress });
        expect(jettonAssets.jettons).toContainEqual({
            address: expectedTVMAddressForEVM,
            rawAmount: BigInt(amountTokenForEVMAddress) * 10n ** BigInt(decimalsForEVMAddress),
        });
    });

    it('should correctly handle different types of AssetBridgingData', async () => {
        const amount1 = 1;
        const amount2 = 0.12;
        const decimals2 = 24;
        const amount3 = BigInt(3) ** BigInt(24);
        const assets: AssetBridgingData[] = [
            {
                amount: amount1,
                type: AssetType.FT,
            },
            {
                address: tvmRandomAddress,
                amount: amount2,
                type: AssetType.FT,
                decimals: decimals2,
            },
            {
                address: tvmRandomAddress,
                type: AssetType.FT,
                rawAmount: amount3,
            },
        ];

        const rawAssets = await sdk['convertAssetsToRawFormat'](assets);
        expect(rawAssets).toContainEqual({ address: undefined, rawAmount: toNano(1) });
        expect(rawAssets).toContainEqual({
            address: tvmRandomAddress,
            rawAmount: BigInt(amount2 * 100) * 10n ** BigInt(decimals2 - 2),
        });
        expect(rawAssets).toContainEqual({
            address: tvmRandomAddress,
            rawAmount: amount3,
        });
    });

    it.each(Object.keys(wallets) as WalletVersion[])(
        'should send cross chain message to CCL from wallet %s',
        async (version) => {
            const evmProxyMsg: EvmProxyMsg = {
                evmTargetAddress: evmRandomAddress,
            };

            // sending TON
            const assets: AssetBridgingData[] = [
                {
                    rawAmount: 2n,
                    type: AssetType.FT,
                },
            ];

            const mnemonic: string[] = await mnemonicNew(24, '');

            const rawSender = await SenderFactory.getSender({
                network: Network.TESTNET,
                version,
                mnemonic: mnemonic.join(' '),
            });

            await user.send({ to: address(rawSender.getSenderAddress()), value: toNano(10), bounce: false });
            const { sendTransactionResult } = await sdk.sendCrossChainTransaction(evmProxyMsg, rawSender, assets);
            expect((sendTransactionResult as any).transactions).toHaveTransaction({
                from: address(rawSender.getSenderAddress()),
                to: crossChainLayer.address,
                success: true,
                op: CrossChainLayerOpCodes.anyone_tvmMsgToEVM,
            });
            expect((await crossChainLayer.getFullData()).protocolFeeSupply).toBe(tacProtocolFee);
        },
    );
});
