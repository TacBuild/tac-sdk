import type { Contract, ContractProvider, MessageRelaxed, SendMode } from '@ton/ton';

import type { SendResult, ShardTransaction } from '../structs/InternalStruct';
import type { Asset, ContractOpener } from '../structs/Struct';
import { Network } from '../structs/Struct';

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
        chain?: Network,
        contractOpener?: ContractOpener,
    ): Promise<SendResult>;
    sendShardTransactions(
        shardTransactions: ShardTransaction[],
        chain?: Network,
        contractOpener?: ContractOpener,
    ): Promise<SendResult[]>;
    getSenderAddress(): string;
    getBalance(contractOpener: ContractOpener): Promise<bigint>;
    getBalanceOf(asset: Asset): Promise<bigint>;
}
