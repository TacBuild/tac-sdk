export interface ITonConnectUI {
    readonly account: { address: string } | null;
    readonly wallet: { device: { features: readonly unknown[] } } | null;
    sendTransaction(transaction: {
        validUntil: number;
        messages: { address: string; amount: string; payload: string }[];
        network: string;
    }): Promise<{ boc: string }>;
}
