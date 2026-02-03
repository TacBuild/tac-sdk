import { SenderAbstraction } from '../interfaces/SenderAbstraction';

export const getMockSender = (senderAddress: string): SenderAbstraction => {
    return {
        getSenderAddress: () => senderAddress,
        sendShardTransaction: async () => ({ success: true, boc: '' }),
        sendShardTransactions: async () => [],
        getBalance: async () => 0n,
        getBalanceOf: async () => 0n,
    };
};
