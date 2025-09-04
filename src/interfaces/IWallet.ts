import type { Contract, ContractProvider, MessageRelaxed, SendMode } from '@ton/ton';

export interface IWallet extends Contract {
    /**
     * Returns current wallet seqno, used for nonce/ordering.
     * @param provider Contract provider to query the wallet.
     */
    getSeqno(provider: ContractProvider): Promise<number>;

    /**
     * Sends a transfer with specified messages and send mode.
     * @param provider Contract provider used to send the transfer.
     * @param args Transfer arguments including seqno, secretKey, messages and sendMode.
     */
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
