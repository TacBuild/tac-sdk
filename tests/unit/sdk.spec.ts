import '@ton/test-utils';

import { address, beginCell, Cell, Dictionary, toNano } from '@ton/core';
import { Blockchain, BlockchainSnapshot, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { ethers } from 'ethers';
import { mnemonicNew } from 'ton-crypto';

import { EvmProxyMsg, Network, SenderFactory, TacSdk, wallets, WalletVersion } from '../../src';

import { testnet } from '@tonappchain/artifacts';
import { sandboxOpener } from '../../src/ton/adapters/contractOpener';

describe('TacSDK', () => {
    const {
        CrossChainLayerCompiled,
        ExecutorCompiled,
        JettonMinterCompiled,
        JettonWalletCompiled,
        JettonProxyCompiled,
        SettingsCompiled,
    } = testnet.ton.compilationArtifacts;
    const { CrossChainLayer, CrossChainLayerOpCodes, JettonMinter, JettonProxy, Settings } = testnet.ton.wrappers;

    const CrossChainLayerCode = Cell.fromHex(CrossChainLayerCompiled.hex);
    const ExecutorCode = Cell.fromHex(ExecutorCompiled.hex);
    const JettonMinterCode = Cell.fromHex(JettonMinterCompiled.hex);
    const JettonWalletCode = Cell.fromHex(JettonWalletCompiled.hex);
    const JettonProxyCode = Cell.fromHex(JettonProxyCompiled.hex);
    const SettingsCode = Cell.fromHex(SettingsCompiled.hex);

    let blockchain: Blockchain;
    let initialState: BlockchainSnapshot;
    let sdk: TacSdk;

    // CCL
    let crossChainLayer: SandboxContract<testnet.ton.wrappers.CrossChainLayer>;
    let admin: SandboxContract<TreasuryContract>;
    let sequencerMultisig: SandboxContract<TreasuryContract>;
    let feeAmount: number;
    let feeSupply: number;
    let merkleRoot: bigint;
    let epoch: number;
    let user: SandboxContract<TreasuryContract>;

    // JETTON PROXY
    let jettonProxy: SandboxContract<testnet.ton.wrappers.JettonProxy>;

    // SETTINGS
    let settings: SandboxContract<testnet.ton.wrappers.Settings>;

    // JETTON MINTER
    let jettonMinter: SandboxContract<testnet.ton.wrappers.JettonMinter>;

    const evmTargetRandomAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

    const deployCCL = async () => {
        crossChainLayer = blockchain.openContract(
            CrossChainLayer.createFromConfig(
                {
                    adminAddress: admin.address.toString(),
                    executorCode: ExecutorCode,
                    feeAmount,
                    feeSupply,
                    merkleRoot,
                    epoch,
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
        settings = await blockchain.openContract(
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
            key: getKeyFromString('JETTON_MINTER_CODE'),
            value: JettonMinterCode,
        });
        await settings.sendSetValue(admin.getSender(), toNano(0.1), {
            key: getKeyFromString('JETTON_WALLET_CODE'),
            value: JettonWalletCode,
        });
    };

    const deployJettonMinter = async () => {
        jettonMinter = blockchain.openContract(
            JettonMinter.createFromConfig(
                {
                    adminAddress: crossChainLayer.address,
                    content: beginCell().endCell(),
                    jettonWalletCode: JettonWalletCode,
                    l2TokenAddress: '0x1234',
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
        feeAmount = 0.1;
        feeSupply = 0;
        merkleRoot = 0n;
        epoch = 0;

        await deployCCL();
        await deployJettonProxy();
        await deploySettings();
        await deployJettonMinter();

        sdk = new TacSdk({
            contractOpener: sandboxOpener(blockchain),
            network: Network.Testnet,
            settingsAddress: settings.address.toString(),
            delay: 0,
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
        expect(balance).toBe(0);
    });

    it.each(Object.keys(wallets) as WalletVersion[])(
        'should send cross chain message to CCL from wallet %s',
        async (version) => {
            const evmProxyMsg: EvmProxyMsg = {
                evmTargetAddress: evmTargetRandomAddress,
            };

            // sending TON
            const assets = [
                {
                    amount: 2,
                },
            ];

            const mnemonic: string[] = await mnemonicNew(24, '');

            let fee = 0;
            const rawSender = await SenderFactory.getSender({
                version,
                mnemonic: mnemonic.join(' '),
            });

            await user.send({ to: address(rawSender.getSenderAddress()), value: toNano(10), bounce: false });
            const { sendTransactionResult } = await sdk.sendCrossChainTransaction(evmProxyMsg, rawSender, assets);
            expect((sendTransactionResult as any).transactions).toHaveTransaction({
                from: address(rawSender.getSenderAddress()),
                to: crossChainLayer.address,
                success: true,
                op: CrossChainLayerOpCodes.anyone_l1MsgToL2,
            });
            fee += feeAmount;
            expect((await crossChainLayer.getFullData()).feeSupply).toBe(+fee.toFixed(1));
        },
    );
});