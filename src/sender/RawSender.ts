import { fromNano, internal, WalletContractV5R1 } from '@ton/ton';
import { MessageRelaxed, SendMode } from '@ton/ton';

import type { ContractOpener } from '../structs/Struct';
import type { ShardTransaction } from '../structs/InternalStruct';
import { Network } from '../structs/Struct';
import { SenderAbstraction, sleep, WalletInstance } from './SenderAbstraction';
import { HighloadWalletV3 } from '../wrappers/HighloadWalletV3';

export class RawSender implements SenderAbstraction {
    constructor(
        private wallet: WalletInstance,
        private secretKey: Buffer,
    ) {}

    async sendShardTransactions(
        shardTransactions: ShardTransaction[],
        delay: number,
        chain: Network,
        contractOpener: ContractOpener,
    ): Promise<unknown> {
        const walletContract = contractOpener.open(this.wallet);

        const isBatchSendSupported =
            walletContract instanceof HighloadWalletV3 || walletContract instanceof WalletContractV5R1;

        if (isBatchSendSupported) {
            const messages: MessageRelaxed[] = [];
            for (const shardTx of shardTransactions) {
                for (const message of shardTx.messages) {
                    messages.push(
                        internal({
                            to: message.address,
                            value: fromNano(message.value),
                            bounce: true,
                            body: message.payload,
                        }),
                    );
                }
            }

            const seqno = await walletContract.getSeqno();
            await sleep(delay * 1000);

            return walletContract.sendTransfer({
                seqno,
                secretKey: this.secretKey,
                messages,
                sendMode: SendMode.PAY_GAS_SEPARATELY,
            });
        } else {
            const results = [];
            for (const shardTx of shardTransactions) {
                results.push(await this.sendShardTransaction(shardTx, delay, chain, contractOpener));
            }
            return results;
        }
    }

    getSenderAddress(): string {
        return this.wallet.address.toString();
    }

    async sendShardTransaction(
        shardTransaction: ShardTransaction,
        delay: number,
        _chain: Network,
        contractOpener: ContractOpener,
    ) {
        const walletContract = contractOpener.open(this.wallet);
        await sleep(delay * 1000);
        const seqno = await walletContract.getSeqno();

        const messages: MessageRelaxed[] = [];
        for (const message of shardTransaction.messages) {
            messages.push(
                internal({
                    to: message.address,
                    value: fromNano(message.value),
                    bounce: true,
                    body: message.payload,
                }),
            );
        }

        await sleep(delay * 1000);
        return walletContract.sendTransfer({
            seqno,
            secretKey: this.secretKey,
            messages,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
        });
    }
}
