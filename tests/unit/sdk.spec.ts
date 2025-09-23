import '@ton/test-utils';

import { address, beginCell, Cell, Dictionary, toNano } from '@ton/core';
import { Blockchain, BlockchainSnapshot, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { testnet } from '../../artifacts';
import { ethers } from 'ethers';
import { mnemonicNew } from 'ton-crypto';

import { Asset, EvmProxyMsg, Network, SenderFactory, TacSdk, wallets, WalletVersion } from '../../src';
import { TON } from '../../src';
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
    // const tvmRandomAddress = 'EQCsQSo54ajAorOfDUAM-RPdDJgs0obqyrNSEtvbjB7hh2oK';

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
        const deployResult = await settings.sendDeploy(admin.getSender(), toNano(0.5));
        expect(deployResult.transactions).toHaveTransaction({
            from: admin.address,
            to: settings.address,
            deploy: true,
            success: true,
        });

        await settings.sendSetValue(admin.getSender(), toNano(0.2), {
            key: getKeyFromString('JettonProxyAddress'),
            value: beginCell().storeAddress(jettonProxy.address).endCell(),
        });
        await settings.sendSetValue(admin.getSender(), toNano(0.2), {
            key: getKeyFromString('CrossChainLayerAddress'),
            value: beginCell().storeAddress(crossChainLayer.address).endCell(),
        });
        await settings.sendSetValue(admin.getSender(), toNano(0.2), {
            key: getKeyFromString('JettonMinterCode'),
            value: JettonMinterCode,
        });
        await settings.sendSetValue(admin.getSender(), toNano(0.2), {
            key: getKeyFromString('JettonWalletCode'),
            value: JettonWalletCode,
        });
        await settings.sendSetValue(admin.getSender(), toNano(0.2), {
            key: getKeyFromString('NFTCollectionCode'),
            value: NFTCollectionCode,
        });
        await settings.sendSetValue(admin.getSender(), toNano(0.2), {
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

    it.each(Object.keys(wallets) as WalletVersion[])(
        'should send cross chain message to CCL from wallet %s',
        async (version) => {
            const mnemonic: string[] = await mnemonicNew(24, '');

            const rawSender = await SenderFactory.getSender({
                network: Network.TESTNET,
                version,
                mnemonic: mnemonic.join(' '),
            });

            const evmProxyMsg: EvmProxyMsg = {
                evmTargetAddress: evmRandomAddress,
            };

            const token = TON.create(sdk.config);

            // sending TON
            const assets: Asset[] = [token.withRawAmount(1n)];

            await user.send({ to: address(rawSender.getSenderAddress()), value: toNano(10), bounce: false });

            const spy = jest.spyOn(sdk['simulator'], 'getSimulationInfo').mockResolvedValue({
                feeParams: {
                    isRoundTrip: true,
                    gasLimit: 1000000000000000000n,
                    protocolFee: toNano(tacProtocolFee) + toNano(tonProtocolFee),
                    evmExecutorFee: 0n,
                    tvmExecutorFee: 0n,
                },
            });

            const { sendTransactionResult } = await sdk.sendCrossChainTransaction(evmProxyMsg, rawSender, assets);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect((sendTransactionResult as any).result.transactions).toHaveTransaction({
                from: address(rawSender.getSenderAddress()),
                to: crossChainLayer.address,
                success: true,
                op: CrossChainLayerOpCodes.anyone_tvmMsgToEVM,
            });

            expect((await crossChainLayer.getFullData()).protocolFeeSupply).toBe(tacProtocolFee + tonProtocolFee);

            expect(spy).toHaveBeenCalled();
            spy.mockRestore();
        },
    );
});
