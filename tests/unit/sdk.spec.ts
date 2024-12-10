import * as Contracts from '../build';

import { Blockchain, SandboxContract, toSandboxContract, TreasuryContract } from '@ton/sandbox';
import { address, beginCell, Cell, Dictionary, toNano } from '@ton/core';

import { CrossChainLayer } from '../wrappers/CrossChainLayer';
import { JettonProxy } from '../wrappers/JettonProxy';
import { JettonMinter } from '../wrappers/JettonMinter';
import { Settings } from '../wrappers/Settings';

import { ethers } from 'ethers';

import '@ton/test-utils';

import { EvmProxyMsg, Network, SenderFactory, TacSdk } from '../../src';
import { mnemonicNew } from 'ton-crypto';

describe('TacSDK', () => {
    const CrossChainLayerCode = Cell.fromHex(Contracts.CrossChainLayerHex);
    const ExecutorCode = Cell.fromHex(Contracts.ExecutorHex);
    const JettonMinterCode = Cell.fromHex(Contracts.JettonMinterHex);
    const JettonWalletCode = Cell.fromHex(Contracts.JettonWalletHex);
    const JettonProxyCode = Cell.fromHex(Contracts.JettonProxyHex);
    const SettingsCode = Cell.fromHex(Contracts.SettingsHex);

    let blockchain: Blockchain;
    let sdk: TacSdk;

    // CCL
    let crossChainLayer: SandboxContract<CrossChainLayer>;
    let admin: SandboxContract<TreasuryContract>;
    let sequencerMultisig: SandboxContract<TreasuryContract>;
    let feeAmount: number;
    let feeSupply: number;
    let merkleRoot: bigint;
    let epoch: number;
    let user: SandboxContract<TreasuryContract>;

    // JETTON PROXY
    let jettonProxy: SandboxContract<JettonProxy>;

    // SETTINGS
    let settings: SandboxContract<Settings>;

    // JETTON MINTER
    let jettonMinter: SandboxContract<JettonMinter>;

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

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        admin = await blockchain.treasury('admin');
        user = await blockchain.treasury('user');
        sequencerMultisig = await blockchain.treasury('sequencerMultisig');
        feeAmount = 0;
        feeSupply = 0.1;
        merkleRoot = 0n;
        epoch = 0;

        await deployCCL();
        await deployJettonProxy();
        await deploySettings();
        await deployJettonMinter();

        sdk = new TacSdk({
            contractOpener: {
                open: (contract) => blockchain.openContract(contract),
                getContractState: async (address) => {
                    const state = await blockchain.provider(address).getState();
                    return {
                        balance: state.balance,
                        //@ts-ignore
                        code: state.state.code || null,
                        state: state.state.type === 'uninit' ? 'uninitialized' : state.state.type,
                    };
                },
            },
            network: Network.Testnet,
            settingsAddress: settings.address.toString(),
            tonClientParameters: { endpoint: '' },
        });
    });

    it('everything should be deployed', () => {
        // check happens in beforeEach clause
    });

    it('getUserJettonWalletAddress', async () => {
        const addr = await sdk.getUserJettonWalletAddress(user.address.toString(), jettonMinter.address.toString());
        expect((await jettonMinter.getWalletAddress(user.address)).toString()).toBe(addr);
    });

    it('getUserJettonWalletAddress', async () => {
        const balance = await sdk.getUserJettonBalance(user.address.toString(), jettonMinter.address.toString());
        expect(balance).toBe(0);
    });

    it('sendCrossChainTransaction', async () => {
        const evmProxyMsg: EvmProxyMsg = {
            evmTargetAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        };

        const assets = [
            {
                amount: 2,
            },
        ];

        const mnemonic: string[] = await mnemonicNew(24, '');

        const rawSender = await SenderFactory.getSender({ version: 'v4', mnemonic: mnemonic.join(' ') });

        await user.send({ to: address(rawSender.getSenderAddress()), value: toNano(10), bounce: false });

        await sdk.sendCrossChainTransaction(evmProxyMsg, rawSender, assets);

        expect((await crossChainLayer.getFullData()).feeSupply).toBe(feeSupply);
    });
});
