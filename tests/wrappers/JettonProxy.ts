import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
    Slice,
    toNano,
} from '@ton/core';

import { OperationType } from './CrossChainLayer';

export type JettonProxyConfig = {
    crossChainLayerAddress: string;
};

export const JettonProxyOpCodes = {
    jettonWallet_transfer: 0xf8a7ea5,
    jettonWallet_transferNotification: 0x7362d09c,

    crossChainLayerAddress_l2MsgToL1proxy: 0x7817b330,
    crossChainLayerAddress_errorNotification: 0xae7df95b,

    anyone_l1MsgToL2: 0x6c582059,
};

export const JettonProxyErrors = {
    noErrors: 0,

    notFromCrossChainLayer: 70,

    notEnoughTon: 100,

    invalidPayload: 200,
};

export function jettonProxyConfigToCell(config: JettonProxyConfig): Cell {
    return beginCell().storeAddress(Address.parse(config.crossChainLayerAddress)).endCell();
}

export class JettonProxy implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new JettonProxy(address);
    }

    static createFromConfig(config: JettonProxyConfig, code: Cell, workchain = 0) {
        const data = jettonProxyConfigToCell(config);
        const init = { code, data };
        return new JettonProxy(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendTransferNotification(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        opts: {
            queryId?: number;
            receivedJettonAmount: number;
            depositorAddress: string;
            crossChainTonAmount?: number;
            l2Data?: Slice;
        },
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(JettonProxyOpCodes.jettonWallet_transferNotification, 32)
                .storeUint(opts.queryId || 0, 64)
                .storeCoins(toNano(opts.receivedJettonAmount.toFixed(9)))
                .storeAddress(Address.parse(opts.depositorAddress))
                .storeCoins(toNano(opts.crossChainTonAmount?.toFixed(9) ?? 0))
                .storeMaybeSlice(opts.l2Data)
                .endCell(),
        });
    }

    async sendErrorNotification(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        opts: {
            queryId?: number;
            jettonWalletAddress: string;
            ownerAddress: string;
            receivedJettonAmount: number;
        },
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(JettonProxyOpCodes.crossChainLayerAddress_errorNotification, 32)
                .storeUint(opts.queryId || 0, 64)
                .storeUint(OperationType.jettonTransfer, 32)
                .storeAddress(Address.parse(opts.jettonWalletAddress))
                .storeAddress(Address.parse(opts.ownerAddress))
                .storeCoins(toNano(opts.receivedJettonAmount.toFixed(9)))
                .endCell(),
        });
    }
    async sendProxy(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        opts: {
            queryId?: number;
            jettonWalletAddress: string;
            toOwnerAddress: string;
            jettonAmount: number;
            responseAddress: string;
            forwardTonAmount?: number;
            forwardPayload?: Cell;
        },
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(JettonProxyOpCodes.crossChainLayerAddress_l2MsgToL1proxy, 32)
                .storeUint(opts.queryId || 0, 64)
                .storeAddress(Address.parse(opts.jettonWalletAddress))
                .storeAddress(Address.parse(opts.toOwnerAddress))
                .storeCoins(toNano(opts.jettonAmount.toFixed(9)))
                .storeAddress(Address.parse(opts.responseAddress))
                .storeCoins(toNano(opts.forwardTonAmount?.toFixed(9) || 0))
                .storeMaybeRef(opts.forwardPayload)
                .endCell(),
        });
    }

    async getFullData(provider: ContractProvider): Promise<JettonProxyConfig> {
        const result = await provider.get('get_full_data', []);

        const crossChainLayerAddress = result.stack.readAddress().toString();

        return {
            crossChainLayerAddress,
        };
    }
}
