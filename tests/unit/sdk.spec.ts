import * as Contracts from '../build';

import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { beginCell, Cell, Dictionary, toNano } from '@ton/core';

import { CrossChainLayer } from '../wrappers/CrossChainLayer';
import { JettonProxy } from '../wrappers/JettonProxy';
import { Settings } from '../wrappers/Settings';

import { ethers } from 'ethers';

import '@ton/test-utils';

import { TacSdk } from '../../src';

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

    // JETTON PROXY
    let jettonProxy: SandboxContract<JettonProxy>;

    // SETTINGS
    let settings: SandboxContract<Settings>;

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

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        admin = await blockchain.treasury('admin');
        sequencerMultisig = await blockchain.treasury('sequencerMultisig');
        feeAmount = 0;
        feeSupply = 0;
        merkleRoot = 0n;
        epoch = 0;

        await deployCCL();
        await deployJettonProxy();
        await deploySettings();
    });

    it('everything should be deployed', () => {
        // check happens in beforeEach clause
    });
});
