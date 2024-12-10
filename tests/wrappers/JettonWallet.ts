import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    fromNano,
    Sender,
    SendMode,
    toNano,
} from '@ton/core';
import { StorageStats } from './gasUtils';

export type JettonWalletConfig = {
    balance: number;
    ownerAddress: string;
    jettonMasterAddress: string;
};
export type JettonWalletData = {
    balance: number;
    ownerAddress: string;
    jettonMasterAddress: string;
    jettonWalletCode: Cell;
};

export enum JettonWalletOpCodes {
    Burn = 0x595f07bc,
    InternalTransfer = 0x178d4519,
    Transfer = 0xf8a7ea5,
    TransferNotification = 0x7362d09c,
    Excesses = 0xd53276db,
    ReturnTon = 0x054fa365,

    BurnNotification = 0x7bdd97de,
}

export const JettonWalletErrors = {
    noErrors: 0,

    notEnoughGas: 48,

    notBounceableOp: 200,

    notWorkchain: 333,
    notMasterchain: 334,

    notFromJettonMaster: 704,
    notFromOwner: 705,
    insufficientJettonBalance: 706,
    notFromJettonMasterOrWallet: 707,
    emptyForwardPayload: 708,
    insufficientMsgValue: 709,
    invalidReceiverAddress: 710,

    unknownOp: 0xffff,
};

export function jettonWalletConfigToCell(config: JettonWalletConfig): Cell {
    return beginCell()
        .storeCoins(toNano(config.balance.toFixed(9)))
        .storeAddress(Address.parse(config.ownerAddress))
        .storeAddress(Address.parse(config.jettonMasterAddress))
        .endCell();
}

export class JettonWallet implements Contract {
    static storageStats = new StorageStats(941, 3);
    static stateInitStats = new StorageStats(847, 3);

    static transferGas = 9371n;
    static receiveGas = 10185n;
    static burnGas = 7865n;

    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new JettonWallet(address);
    }

    static createFromConfig(config: JettonWalletConfig, code: Cell, workchain = 0) {
        const data = jettonWalletConfigToCell(config);
        const init = { code, data };
        return new JettonWallet(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendBurn(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        opts: {
            queryId?: number;
            jettonAmount: number;
            receiverAddress?: string;
            crossChainTonAmount?: number;
            crossChainPayload?: Cell | null;
        },
    ) {
        let body = beginCell()
            .storeUint(JettonWalletOpCodes.Burn, 32)
            .storeUint(opts.queryId || 0, 64)
            .storeCoins(toNano(opts.jettonAmount.toFixed(9)))
            .storeAddress(opts.receiverAddress ? Address.parse(opts.receiverAddress) : null);

        if (opts.crossChainTonAmount || opts.crossChainPayload) {
            body.storeMaybeRef(
                beginCell()
                    .storeCoins(toNano(opts.crossChainTonAmount?.toFixed(9) ?? 0))
                    .storeMaybeRef(opts.crossChainPayload)
                    .endCell(),
            );
        } else {
            body.storeMaybeRef(null);
        }

        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: body.endCell(),
        });
    }

    async sendCrossChainTransfer(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        opts: {
            queryId?: number;
            jettonAmount: number;
            toOwnerAddress: string;
            responseAddress?: string;
            customPayload?: Cell | null;
            forwardTonAmount?: number;
            crossChainTonAmount?: number;
            crossChainPayload?: Cell | null;
        },
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(JettonWalletOpCodes.Transfer, 32)
                .storeUint(opts.queryId || 0, 64)
                .storeCoins(toNano(opts.jettonAmount.toFixed(9)))
                .storeAddress(Address.parse(opts.toOwnerAddress))
                .storeAddress(opts.responseAddress ? Address.parse(opts.responseAddress) : null)
                .storeMaybeRef(opts.customPayload)
                .storeCoins(toNano(opts.forwardTonAmount?.toFixed(9) || 0))
                .storeCoins(toNano(opts.crossChainTonAmount?.toFixed(9) ?? 0))
                .storeMaybeRef(opts.crossChainPayload)
                .endCell(),
        });
    }

    async sendTransfer(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        opts: {
            queryId?: number;
            jettonAmount: number;
            toOwnerAddress: string;
            responseAddress?: string;
            customPayload?: Cell | null;
            forwardTonAmount?: number;
            forwardPayload?: Cell | null;
        },
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(JettonWalletOpCodes.Transfer, 32)
                .storeUint(opts.queryId || 0, 64)
                .storeCoins(toNano(opts.jettonAmount.toFixed(9)))
                .storeAddress(Address.parse(opts.toOwnerAddress))
                .storeAddress(opts.responseAddress ? Address.parse(opts.responseAddress) : null)
                .storeMaybeRef(opts.customPayload)
                .storeCoins(toNano(opts.forwardTonAmount?.toFixed(9) || 0))
                .storeMaybeRef(opts.forwardPayload)
                .endCell(),
        });
    }

    async sendReceive(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        opts: {
            queryId?: number;
            jettonAmount: number;
            fromOwnerAddress?: string;
            responseAddress?: string;
            forwardTonAmount?: number;
            forwardPayload?: Cell;
        },
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(JettonWalletOpCodes.InternalTransfer, 32)
                .storeUint(opts.queryId || 0, 64)
                .storeCoins(toNano(opts.jettonAmount.toFixed(9)))
                .storeAddress(opts.fromOwnerAddress ? Address.parse(opts.fromOwnerAddress) : null)
                .storeAddress(opts.responseAddress ? Address.parse(opts.responseAddress) : null)
                .storeCoins(opts.forwardTonAmount || 0)
                .storeMaybeRef(opts.forwardPayload)
                .endCell(),
        });
    }

    async sendReturnTon(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(JettonWalletOpCodes.ReturnTon, 32).endCell(),
        });
    }

    async getWalletData(provider: ContractProvider): Promise<JettonWalletData> {
        const result = await provider.get('get_wallet_data', []);
        return {
            balance: Number(fromNano(result.stack.readBigNumber())),
            ownerAddress: result.stack.readAddress().toString(),
            jettonMasterAddress: result.stack.readAddress().toString(),
            jettonWalletCode: result.stack.readCell(),
        };
    }

    async getJettonBalance(provider: ContractProvider) {
        let state = await provider.getState();
        if (state.state.type !== 'active') {
            return 0n;
        }
        let res = await provider.get('get_wallet_data', []);
        return Number(fromNano(res.stack.readBigNumber()));
    }
}
