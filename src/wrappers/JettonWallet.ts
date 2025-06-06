import type { Contract, ContractProvider, Sender } from '@ton/ton';
import { Address, beginCell, Cell, contractAddress, SendMode } from '@ton/ton';

export type JettonWalletData = {
    balance: bigint;
    ownerAddress: string;
    jettonMasterAddress: string;
    jettonWalletCode: Cell;
};

export enum JettonWalletOpCodes {
    burn = 0x595f07bc,
    transfer = 0xf8a7ea5,
}

export function jettonWalletConfigToCell(config: JettonWalletData): Cell {
    return beginCell()
        .storeCoins(config.balance)
        .storeAddress(Address.parse(config.ownerAddress))
        .storeAddress(Address.parse(config.jettonMasterAddress))
        .endCell();
}

export class JettonWallet implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new JettonWallet(address);
    }

    static createFromConfig(config: JettonWalletData, code: Cell, workchain = 0) {
        const data = jettonWalletConfigToCell(config);
        const init = { code, data };
        return new JettonWallet(contractAddress(workchain, init), init);
    }

    static burnMessage(
        jettonAmount: bigint,
        receiverAddress?: string,
        crossChainTonAmount?: bigint,
        feeData?: Cell | null,
        crossChainPayload?: Cell | null,
        queryId?: number,
    ) {
        const body = beginCell()
            .storeUint(JettonWalletOpCodes.burn, 32)
            .storeUint(queryId || 0, 64)
            .storeCoins(jettonAmount)
            .storeAddress(receiverAddress ? Address.parse(receiverAddress) : null);

        if (crossChainTonAmount || crossChainPayload) {
            body.storeMaybeRef(
                beginCell()
                    .storeCoins(crossChainTonAmount ?? 0n)
                    .storeMaybeRef(feeData)
                    .storeMaybeRef(crossChainPayload)
                    .endCell(),
            );
        } else {
            body.storeMaybeRef(null);
        }

        return body.endCell();
    }

    async sendBurn(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        opts: {
            queryId?: number;
            jettonAmount: bigint;
            receiverAddress?: string;
            crossChainTonAmount?: bigint;
            feeData?: Cell | null;
            crossChainPayload?: Cell | null;
        },
    ) {
        const body = JettonWallet.burnMessage(
            opts.jettonAmount,
            opts.receiverAddress,
            opts.crossChainTonAmount,
            opts.feeData,
            opts.crossChainPayload,
            opts.queryId,
        );

        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: body,
        });
    }

    static transferMessage(
        jettonAmount: bigint,
        to: string,
        responseAddress: string | null,
        forwardTonAmount?: bigint,
        crossChainTonAmount?: bigint,
        feeData?: Cell | null,
        crossChainPayload?: Cell | null,
        queryId?: number,
    ) {
        return beginCell()
            .storeUint(JettonWalletOpCodes.transfer, 32)
            .storeUint(queryId ?? 0, 64)
            .storeCoins(jettonAmount)
            .storeAddress(Address.parse(to))
            .storeAddress(responseAddress ? Address.parse(responseAddress) : null)
            .storeMaybeRef(null)
            .storeCoins(forwardTonAmount || 0n)
            .storeMaybeRef(
                beginCell()
                    .storeCoins(crossChainTonAmount ?? 0n)
                    .storeMaybeRef(feeData)
                    .storeMaybeRef(crossChainPayload)
                    .endCell(),
            )
            .endCell();
    }

    async sendTransfer(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        opts: {
            queryId?: number;
            jettonAmount: bigint;
            toOwnerAddress: string;
            responseAddress?: string;
            customPayload?: Cell | null;
            forwardTonAmount?: bigint;
            forwardPayload?: Cell | null;
        },
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(JettonWalletOpCodes.transfer, 32)
                .storeUint(opts.queryId || 0, 64)
                .storeCoins(opts.jettonAmount)
                .storeAddress(Address.parse(opts.toOwnerAddress))
                .storeAddress(opts.responseAddress ? Address.parse(opts.responseAddress) : null)
                .storeMaybeRef(opts.customPayload)
                .storeCoins(opts.forwardTonAmount ?? 0n)
                .storeMaybeRef(opts.forwardPayload)
                .endCell(),
        });
    }

    async getWalletData(provider: ContractProvider): Promise<JettonWalletData> {
        const result = await provider.get('get_wallet_data', []);
        return {
            balance: result.stack.readBigNumber(),
            ownerAddress: result.stack.readAddress().toString(),
            jettonMasterAddress: result.stack.readAddress().toString(),
            jettonWalletCode: result.stack.readCell(),
        };
    }

    async getJettonBalance(provider: ContractProvider): Promise<bigint> {
        const state = await provider.getState();
        if (state.state.type !== 'active') {
            return 0n;
        }
        const result = await provider.get('get_wallet_data', []);
        return result.stack.readBigNumber();
    }
}
