import { fromNano, internal } from '@ton/ton';
import { MessageRelaxed, SendMode } from '@ton/ton';

import type { ContractOpener } from '../structs/Struct';
import type { ShardTransaction } from '../structs/InternalStruct';
import { Network } from '../structs/Struct';
import { SenderAbstraction, sleep, WalletInstance } from './SenderAbstraction';

export class RawSender implements SenderAbstraction {
    constructor(
        private wallet: WalletInstance,
        private secretKey: Buffer,
    ) {}

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
