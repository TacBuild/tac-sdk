/* eslint-disable @typescript-eslint/no-explicit-any */
import '@ton/test-utils';

import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { address, beginCell, SendMode, toNano, WalletContractV4, WalletContractV5R1 } from '@ton/ton';

import { BatchSender, ContractOpener, HighloadWalletV3,Network, SenderAbstraction, SenderFactory } from '../../src';
import { sandboxOpener } from '../../src';
import { RawSender } from '../../src/sender/RawSender';
import { SendResult, ShardTransaction } from '../../src/structs/InternalStruct';

describe('RawSender', () => {
    let blockchain: Blockchain;
    let contractOpener: ContractOpener;
    let deployer: SandboxContract<TreasuryContract>;
    const mnemonic =
        'sibling cover host ask camera coin harbor pepper weekend knife sponsor boost top write torch axis horn control puppy speak suit crystal harsh equal';
    let rawSenderV4: SenderAbstraction;
    let rawSenderV5: SenderAbstraction;
    let rawSenderHighloadV3: SenderAbstraction;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        contractOpener = sandboxOpener(blockchain);
        deployer = await blockchain.treasury('deployer');
        rawSenderV4 = await SenderFactory.getSender({
            network: Network.TESTNET,
            mnemonic: mnemonic,
            version: 'V4',
        });
        rawSenderV5 = await SenderFactory.getSender({
            network: Network.TESTNET,
            mnemonic: mnemonic,
            version: 'V5R1',
        });
        rawSenderHighloadV3 = await SenderFactory.getSender({
            network: Network.TESTNET,
            mnemonic: mnemonic,
            version: 'HIGHLOAD_V3',
        });
        await deployer.send({
            to: address(rawSenderV4.getSenderAddress()),
            value: toNano('1000'),
            bounce: false,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
        });
        await deployer.send({
            to: address(rawSenderV5.getSenderAddress()),
            value: toNano('1000'),
            bounce: false,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
        });
        await deployer.send({
            to: address(rawSenderHighloadV3.getSenderAddress()),
            value: toNano('1000'),
            bounce: false,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
        });
    });

    it('should setup correctly', async () => {
        expect((await blockchain.getContract(address(rawSenderV4.getSenderAddress()))).balance).toBeGreaterThanOrEqual(
            toNano('999'),
        );
        expect((await blockchain.getContract(address(rawSenderV5.getSenderAddress()))).balance).toBeGreaterThanOrEqual(
            toNano('999'),
        );
        expect(
            (await blockchain.getContract(address(rawSenderHighloadV3.getSenderAddress()))).balance,
        ).toBeGreaterThanOrEqual(toNano('999'));

        expect(rawSenderV4 instanceof RawSender).toBe(true);
        expect(rawSenderV5 instanceof RawSender).toBe(true);
        expect(rawSenderHighloadV3 instanceof BatchSender).toBe(true);

        expect((rawSenderV4 as RawSender)['wallet'] instanceof WalletContractV4).toBe(true);
        expect((rawSenderV5 as RawSender)['wallet'] instanceof WalletContractV5R1).toBe(true);
        expect((rawSenderHighloadV3 as BatchSender)['wallet'] instanceof HighloadWalletV3).toBe(true);
    });

    it('should send a single shard transaction', async () => {
        const recipient = await blockchain.treasury('recipient');

        const shardTx: ShardTransaction = {
            network: Network.TESTNET,
            validUntil: +new Date() + 15 * 60 * 1000,
            messages: [
                {
                    address: recipient.address.toString(),
                    value: toNano(1),
                    payload: beginCell().storeUint(0, 32).storeStringTail('test payload').endCell(),
                },
            ],
        };

        const { result }: SendResult = await rawSenderV4.sendShardTransaction(shardTx, Network.TESTNET, contractOpener);

        expect((result as any).transactions).toHaveTransaction({
            from: address(rawSenderV4.getSenderAddress()),
            to: recipient.address,
            value: toNano(1),
            body: beginCell().storeUint(0, 32).storeStringTail('test payload').endCell(),
            success: true,
        });
    });

    it('should send multiple shard transactions for raw sender', async () => {
        const recipient1 = await blockchain.treasury('recipient1');
        const recipient2 = await blockchain.treasury('recipient2');
        const shardTxs: ShardTransaction[] = [
            {
                network: Network.TESTNET,
                validUntil: +new Date() + 15 * 60 * 1000,
                messages: [
                    {
                        address: recipient1.address.toString(),
                        value: toNano(1),
                        payload: beginCell().storeUint(1, 32).endCell(),
                    },
                ],
            },
            {
                network: Network.TESTNET,
                validUntil: +new Date() + 15 * 60 * 1000,
                messages: [
                    {
                        address: recipient2.address.toString(),
                        value: toNano(0.3),
                        payload: beginCell().storeUint(2, 32).endCell(),
                    },
                ],
            },
        ];

        const results: SendResult[] = await rawSenderV4.sendShardTransactions(
            shardTxs,
            Network.TESTNET,
            contractOpener,
        );

        expect((results[0].result as any).transactions).toHaveTransaction({
            from: address(rawSenderV4.getSenderAddress()),
            to: recipient1.address,
            value: toNano(1),
            body: beginCell().storeUint(1, 32).endCell(),
            success: true,
        });
        expect((results[0].result as any).transactions).toHaveTransaction({
            from: address(rawSenderV4.getSenderAddress()),
            to: recipient2.address,
            value: toNano(0.3),
            body: beginCell().storeUint(2, 32).endCell(),
            success: true,
        });
    });

    it('should send multiple shard transactions through W5', async () => {
        const recipient = await blockchain.treasury('recipient');
        const shardTxs: ShardTransaction[] = Array.from({ length: 254 / 2 }, (_, i) => ({
            network: Network.TESTNET,
            validUntil: +new Date() + 15 * 60 * 1000,
            messages: [
                {
                    address: recipient.address.toString(),
                    value: toNano(0.1),
                    payload: beginCell()
                        .storeUint(i + 1, 32)
                        .endCell(),
                },
                {
                    address: recipient.address.toString(),
                    value: toNano(0.05),
                    payload: beginCell()
                        .storeUint(i + 1, 32)
                        .storeUint(2, 32)
                        .endCell(),
                },
            ],
        }));

        const results: SendResult[] = await rawSenderV5.sendShardTransactions(
            shardTxs,
            Network.TESTNET,
            contractOpener,
        );

        expect((results[0].result as any).transactions).toHaveTransaction({
            from: undefined,
            to: address(rawSenderV5.getSenderAddress()),
            outMessagesCount: 254,
            success: true,
        });
    });

    it('should send multiple shard transactions through Highload V3', async () => {
        const recipient = await blockchain.treasury('recipient');
        const shardTxs: ShardTransaction[] = Array.from({ length: 254 / 2 }, (_, i) => ({
            network: Network.TESTNET,
            validUntil: +new Date() + 15 * 60 * 1000,
            messages: [
                {
                    address: recipient.address.toString(),
                    value: toNano(0.1),
                    payload: beginCell()
                        .storeUint(i + 1, 32)
                        .endCell(),
                },
                {
                    address: recipient.address.toString(),
                    value: toNano(0.05),
                    payload: beginCell()
                        .storeUint(i + 1, 32)
                        .storeUint(2, 32)
                        .endCell(),
                },
            ],
        }));

        const results: SendResult[] = await rawSenderHighloadV3.sendShardTransactions(
            shardTxs,
            Network.TESTNET,
            contractOpener,
        );

        expect((results[0].result as any).transactions).toHaveTransaction({
            from: address(rawSenderHighloadV3.getSenderAddress()),
            to: address(rawSenderHighloadV3.getSenderAddress()),
            outMessagesCount: 254,
            success: true,
        });
    });

    it('should send a lot of shard transactions through Highload V3', async () => {
        const recipient = await blockchain.treasury('recipient');

        const shardTxs: ShardTransaction[] = Array.from({ length: 1024 }, (_, i) => ({
            network: Network.TESTNET,
            validUntil: +new Date() + 15 * 60 * 1000,
            messages: [
                {
                    address: recipient.address.toString(),
                    value: toNano(0.1),
                    payload: beginCell()
                        .storeUint(i + 1, 32)
                        .endCell(),
                },
                {
                    address: recipient.address.toString(),
                    value: toNano(0.05),
                    payload: beginCell()
                        .storeUint(i + 1, 32)
                        .storeUint(2, 32)
                        .endCell(),
                },
            ],
        }));

        const results: SendResult[] = await rawSenderHighloadV3.sendShardTransactions(
            shardTxs,
            Network.TESTNET,
            contractOpener,
        );
        expect(results.reduce((acc, curr) => acc + (curr.result as any)?.transactions.length, 0)).toBe(18 + 1024 * 2);
    });
});
