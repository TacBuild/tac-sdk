import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
    toNano,
} from '@ton/ton';
import { Maybe } from '@ton/core/dist/utils/maybe';
import { CrossChainLayerOpCodes, OperationType } from './CrossChainLayer';
import { fromNano } from '@ton/core';

export const JettonMinterOpCodes = {
    Mint: 0xd7b9c06e,
    ChangeAdmin: 0xfbdf9ff0,
    ChangeContent: 0x23f78ab7,
    BurnNotification: 0x7bdd97de,
    Excesses: 0xd53276db,
    WithdrawExtraTon: 0x1754ab63,
};

export const JettonMinterErrors = {
    noErrors: 0,

    notFromAdmin: 73,
    notFromJettonWallet: 74,
};

export type JettonMinterConfig = {
    totalSupply: number;
    adminAddress: Address;
    content: Cell;
    jettonWalletCode: Cell;
    l2TokenAddress: string;
};

export function jettonMinterConfigToCell(config: JettonMinterConfig): Cell {
    return beginCell()
        .storeCoins(toNano(config.totalSupply.toFixed(9)))
        .storeAddress(config.adminAddress)
        .storeRef(config.content)
        .storeRef(config.jettonWalletCode)
        .storeStringTail(config.l2TokenAddress)
        .endCell();
}

export class JettonMinter implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new JettonMinter(address);
    }

    static createFromConfig(config: JettonMinterConfig, code: Cell, workchain = 0) {
        const data = jettonMinterConfigToCell(config);
        const init = { code, data };
        return new JettonMinter(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendErrorNotification(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        params: {
            queryId?: number | bigint;
            operation?: number | bigint;
            jettonOwnerAddress: Address;
            jettonAmount: number;
        },
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(CrossChainLayerOpCodes.anyone_errorNotification, 32)
                .storeUint(params.queryId || 0, 64)
                .storeUint(params.operation || OperationType.jettonBurn, 32)
                .storeAddress(params.jettonOwnerAddress)
                .storeCoins(toNano(params.jettonAmount.toFixed(9)))
                .endCell(),
        });
    }

    static mintMessage(
        to: Address,
        jettonAmount: number,
        forwardTonAmount: number,
        forwardPayload: Maybe<Cell>,
        newContent: Maybe<Cell>,
        queryId: number | bigint,
    ) {
        return beginCell()
            .storeUint(JettonMinterOpCodes.Mint, 32)
            .storeUint(queryId, 64)
            .storeAddress(to)
            .storeCoins(toNano(jettonAmount.toFixed(9)))
            .storeCoins(toNano(forwardTonAmount.toFixed(9)))
            .storeMaybeRef(forwardPayload)
            .storeMaybeRef(newContent)
            .endCell();
    }

    async sendMint(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        params: {
            to: Address;
            jettonAmount: number;
            forwardTonAmount: number;
            forwardPayload: Maybe<Cell>;
            newContent: Maybe<Cell>;
            queryId?: number | bigint;
        },
    ) {
        if (value <= params.forwardTonAmount) {
            throw new Error('totalTonAmount should be > forward amount');
        }
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: JettonMinter.mintMessage(
                params.to,
                params.jettonAmount,
                params.forwardTonAmount,
                params.forwardPayload,
                params.newContent,
                params.queryId || 0,
            ),
            value,
        });
    }

    async sendChangeAdmin(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        params: { newAdmin: Address; queryId?: number | bigint },
    ) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(JettonMinterOpCodes.ChangeAdmin, 32)
                .storeUint(params.queryId || 0, 64)
                .storeAddress(params.newAdmin)
                .endCell(),
            value,
        });
    }

    async sendChangeContent(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        params: { content: Cell; queryId?: number | bigint },
    ) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(JettonMinterOpCodes.ChangeContent, 32)
                .storeUint(params.queryId || 0, 64)
                .storeRef(params.content)
                .endCell(),
            value,
        });
    }

    async sendBurnNotification(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        params: {
            jettonAmount: number;
            from: Address;
            responseAddress: Address;
            crossChainTonAmount?: number;
            crossChainPayload?: Cell | null;
        },
    ) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(JettonMinterOpCodes.BurnNotification, 32)
                .storeUint(0, 64)
                .storeCoins(toNano(params.jettonAmount.toFixed(9)))
                .storeAddress(params.from)
                .storeAddress(params.responseAddress)
                .storeCoins(toNano(params.crossChainTonAmount?.toFixed(9) ?? 0))
                .storeMaybeRef(params.crossChainPayload)
                .endCell(),
            value,
        });
    }

    async sendWithdrawExtraTon(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        params?: { queryId?: bigint | number },
    ) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(JettonMinterOpCodes.WithdrawExtraTon, 32)
                .storeUint(params?.queryId || 0, 64)
                .endCell(),
            value,
        });
    }

    async getWalletAddress(provider: ContractProvider, owner: Address): Promise<Address> {
        const res = await provider.get('get_wallet_address', [
            { type: 'slice', cell: beginCell().storeAddress(owner).endCell() },
        ]);
        return res.stack.readAddress();
    }

    async getJettonData(provider: ContractProvider) {
        const res = await provider.get('get_jetton_data', []);
        const totalSupply = Number(fromNano(res.stack.readBigNumber()));
        const mintable = res.stack.readBoolean();
        const adminAddress = res.stack.readAddress();
        const content = res.stack.readCell();
        const walletCode = res.stack.readCell();
        return {
            totalSupply,
            mintable,
            adminAddress,
            content,
            walletCode,
        };
    }

    async getL2TokenAddress(provider: ContractProvider) {
        const res = await provider.get('get_l2_token_address', []);
        return res.stack.readString();
    }

    async getFullData(provider: ContractProvider) {
        const res = await provider.get('get_full_data', []);
        const totalSupply = Number(fromNano(res.stack.readBigNumber()));
        const mintable = res.stack.readBoolean();
        const adminAddress = res.stack.readAddress();
        const content = res.stack.readCell();
        const walletCode = res.stack.readCell();
        const l2TokenAddress = res.stack.readString();
        return {
            totalSupply,
            mintable,
            adminAddress,
            content,
            walletCode,
            l2TokenAddress,
        };
    }
}
