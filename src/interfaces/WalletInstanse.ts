import type { Cell, Contract, ContractProvider, MessageRelaxed, SendMode } from '@ton/ton';

export interface WalletInstanse extends Contract {
    /**
     * Returns current wallet seqno, used for nonce/ordering.
     * @param provider Contract provider to query the wallet.
     */
    getSeqno(provider: ContractProvider): Promise<number>;

    send(provider: ContractProvider, msg: Cell): Promise<string | void>;
    createTransfer(args: {
        seqno: number;
        secretKey: Buffer;
        messages: MessageRelaxed[];
        sendMode: SendMode;
        timeout?: number;
    }): Cell;
}
