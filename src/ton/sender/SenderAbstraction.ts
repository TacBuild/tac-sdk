import type { Contract, ContractProvider, MessageRelaxed, SendMode } from '@ton/ton';
import { Network } from '../structs/Struct';
import type { ContractOpener, ShardTransaction } from '../structs/Struct';

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface WalletInstance extends Contract {
    getSeqno(provider: ContractProvider): Promise<number>;

    sendTransfer(
        provider: ContractProvider,
        args: {
            seqno: number;
            secretKey: Buffer;
            messages: MessageRelaxed[];
            sendMode: SendMode;
            timeout?: number;
        },
    ): Promise<void>;
}

export interface SenderAbstraction {
    sendShardTransaction(
        shardTransaction: ShardTransaction,
        delay: number,
        chain?: Network,
        contractOpener?: ContractOpener,
    ): Promise<void>;
    getSenderAddress(): string;
}
