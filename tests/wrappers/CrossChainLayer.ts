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
    Slice,
    toNano,
} from '@ton/core';
import { Params } from './Constants';
import { StorageStats } from './gasUtils';

export type CrossChainLayerConfig = {
    adminAddress: string;
    sequencerMultisigAddress: string;
    merkleRoot: bigint;
    epoch: number;
    feeAmount: number;
    feeSupply: number;
    executorCode: Cell;
};

export enum OperationType {
    tonTransfer = 0x4ad67cd3,
    jettonTransfer = 0x2906ab02,
    nftTransfer = 0xe73856ea,
    jettonBurn = 0xb0afa74d,
}

export const CrossChainLayerOpCodes = {
    anyone_l1MsgToL2: 0x6c582059,
    anyone_errorNotification: 0xae7df95b,
    anyone_excesses: 0xd53276db,
    anyone_addFee: 0x05743c53,

    executor_l2MsgToL1: 0x0e50d313,
    executor_revertSpentParam: 0x959f183a,

    admin_changeAdminAddress: 0x581879bc,
    admin_changeFeeAmount: 0x2652ed3c,
    admin_updateCode: 0x20faec53,
    admin_updateExecutorCode: 0x7ee5a6d0,

    sequencerMultisig_changeSequencerMultisigAddress: 0x5cec6be0,
    sequencerMultisig_updateMerkleRoot: 0x23b05641,
    sequencerMultisig_collectFee: 0x18eaeaf5,
    sequencerMultisig_collectFeeNotification: 0xcf535451,
};

export const CrossChainLayerErrors = {
    noErrors: 0,

    notFromAdmin: 70,
    notFromExecutor: 71,
    notFromSequencerMultisig: 72,

    notEnoughTon: 100,
    insufficientBalance: 101,

    zeroFeeSupply: 200,
    invalidProof: 201,
};

export function crossChainLayerConfigToCell(config: CrossChainLayerConfig): Cell {
    return beginCell()
        .storeAddress(Address.parse(config.adminAddress))
        .storeAddress(Address.parse(config.sequencerMultisigAddress))
        .storeUint(config.merkleRoot, Params.bitsize.hash)
        .storeUint(config.epoch, Params.bitsize.time)
        .storeCoins(toNano(config.feeAmount.toFixed(9)))
        .storeCoins(toNano(config.feeSupply.toFixed(9)))
        .storeRef(config.executorCode)
        .endCell();
}

export class CrossChainLayer implements Contract {
    static storageStats = new StorageStats(17486, 36);

    static addFeeGasConsumption = 3402n;

    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new CrossChainLayer(address);
    }

    static createFromConfig(config: CrossChainLayerConfig, code: Cell, workchain = 0) {
        const data = crossChainLayerConfigToCell(config);
        const init = { code, data };
        return new CrossChainLayer(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendL1MsgToL2(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        opts: {
            queryId?: number;
            operationType: OperationType;
            crossChainTonAmount: number;
            payload: Slice;
            responseAddress?: string;
        },
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(CrossChainLayerOpCodes.anyone_l1MsgToL2, Params.bitsize.op)
                .storeUint(opts.queryId || 0, Params.bitsize.queryId)
                .storeUint(opts.operationType, Params.bitsize.op)
                .storeCoins(toNano(opts.crossChainTonAmount.toFixed(9)))
                .storeAddress(opts.responseAddress ? Address.parse(opts.responseAddress) : null)
                .storeSlice(opts.payload)
                .endCell(),
        });
    }

    async sendL2MsgToL1(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        opts: {
            queryId?: number;
            merkleProof: Cell;
            payload: Cell;
            responseAddress?: string;
        },
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(CrossChainLayerOpCodes.executor_l2MsgToL1, Params.bitsize.op)
                .storeUint(opts.queryId || 0, Params.bitsize.queryId)
                .storeRef(opts.merkleProof)
                .storeRef(opts.payload)
                .storeAddress(opts.responseAddress ? Address.parse(opts.responseAddress) : null)
                .endCell(),
        });
    }

    async sendUpdateMerkleRoot(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        opts: {
            queryId?: number;
            merkleRoot: bigint;
            epoch: number;
        },
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(CrossChainLayerOpCodes.sequencerMultisig_updateMerkleRoot, Params.bitsize.op)
                .storeUint(opts.queryId || 0, Params.bitsize.queryId)
                .storeUint(opts.merkleRoot, Params.bitsize.hash)
                .storeUint(opts.epoch, Params.bitsize.time)
                .endCell(),
        });
    }

    async sendAddFee(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        opts?: {
            queryId?: number;
        },
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(CrossChainLayerOpCodes.anyone_addFee, Params.bitsize.op)
                .storeUint(opts?.queryId ?? 0, Params.bitsize.queryId)
                .endCell(),
        });
    }

    async sendCollectFee(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        opts: {
            queryId?: number;
        },
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(CrossChainLayerOpCodes.sequencerMultisig_collectFee, Params.bitsize.op)
                .storeUint(opts.queryId || 0, Params.bitsize.queryId)
                .endCell(),
        });
    }

    async sendChangeAdmin(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        opts: {
            queryId?: number;
            adminAddress: string;
        },
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(CrossChainLayerOpCodes.admin_changeAdminAddress, Params.bitsize.op)
                .storeUint(opts.queryId || 0, Params.bitsize.queryId)
                .storeAddress(Address.parse(opts.adminAddress))
                .endCell(),
        });
    }

    async sendChangeSequencerMultisig(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        opts: {
            queryId?: number;
            sequencerMultisigAddress: string;
        },
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(CrossChainLayerOpCodes.sequencerMultisig_changeSequencerMultisigAddress, Params.bitsize.op)
                .storeUint(opts.queryId || 0, Params.bitsize.queryId)
                .storeAddress(Address.parse(opts.sequencerMultisigAddress))
                .endCell(),
        });
    }

    async sendChangeFeeAmount(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        opts: {
            queryId?: number;
            feeAmount: number;
        },
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(CrossChainLayerOpCodes.admin_changeFeeAmount, Params.bitsize.op)
                .storeUint(opts.queryId || 0, Params.bitsize.queryId)
                .storeCoins(toNano(opts.feeAmount.toFixed(9)))
                .endCell(),
        });
    }

    async sendUpdateCode(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        opts: {
            queryId?: number;
            code: Cell;
        },
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(CrossChainLayerOpCodes.admin_updateCode, Params.bitsize.op)
                .storeUint(opts.queryId || 0, Params.bitsize.queryId)
                .storeRef(opts.code)
                .endCell(),
        });
    }

    async sendUpdateExecutorCode(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        opts: {
            queryId?: number;
            code: Cell;
        },
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(CrossChainLayerOpCodes.admin_updateExecutorCode, 32)
                .storeUint(opts.queryId || 0, 64)
                .storeRef(opts.code)
                .endCell(),
        });
    }

    async getFullData(provider: ContractProvider): Promise<CrossChainLayerConfig> {
        const result = await provider.get('get_full_data', []);

        const adminAddress = result.stack.readAddress().toString();
        const sequencerMultisigAddress = result.stack.readAddress().toString();
        const merkleRoot = result.stack.readBigNumber();
        const epoch = result.stack.readNumber();
        const feeAmount = Number(fromNano(result.stack.readNumber()));
        const feeSupply = Number(fromNano(result.stack.readNumber()));
        const executorCode = result.stack.readCell();

        return {
            adminAddress,
            sequencerMultisigAddress,
            merkleRoot,
            epoch,
            feeAmount,
            feeSupply,
            executorCode,
        };
    }

    async getUpdateCodeTest(provider: ContractProvider): Promise<boolean> {
        try {
            const result = await provider.get('test', []);
            return result.stack.readNumber() == -1;
        } catch (e) {
            return false;
        }
    }

    async getExecutorAddress(provider: ContractProvider, payload: Cell): Promise<string> {
        const result = await provider.get('get_executor_address', [{ type: 'cell', cell: payload }]);
        return result.stack.readAddress().toString();
    }
}
