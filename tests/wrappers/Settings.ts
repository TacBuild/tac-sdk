import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Dictionary,
    Sender,
    SendMode,
} from '@ton/core';

export type SettingsConfig = {
    settings: Dictionary<bigint, Cell>;
    adminAddress: Address;
};

export type SendValueParams = {
    key: bigint;
    value: Cell;
};

export type ChangeAdminParams = {
    adminAddress: Address;
};

export type GetValueParams = {
    key: bigint;
};

export const SettingsOpCodes = {
    admin_setValue: 0x245e9406,
    admin_changeAdmin: 0xfbdf9ff0,

    anyone_getValue: 0x399685b8,
    anyone_getAll: 0x40148d4a,

    settings_sendValue: 0x707a28d2,
    settings_sendAll: 0xcf03b318,
};

export const SettingsErrors = {
    notFromAdmin: 70,
};

export function settingsConfigToCell(config: SettingsConfig): Cell {
    return beginCell().storeDict(config.settings).storeAddress(config.adminAddress).endCell();
}

export class Settings implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
        readonly configuration?: SettingsConfig,
    ) {}

    static createFromAddress(address: Address) {
        return new Settings(address);
    }

    static createFromConfig(config: SettingsConfig, code: Cell, workchain = 0) {
        const data = settingsConfigToCell(config);
        const init = { code, data };

        return new Settings(contractAddress(workchain, init), init, config);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendSetValue(provider: ContractProvider, via: Sender, value: bigint, params: SendValueParams) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(SettingsOpCodes.admin_setValue, 32)
                .storeUint(0, 64)
                .storeUint(params.key, 256)
                .storeRef(params.value)
                .endCell(),
        });
    }

    async sendGetValue(provider: ContractProvider, via: Sender, value: bigint, params: GetValueParams) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(SettingsOpCodes.anyone_getValue, 32)
                .storeUint(0, 64)
                .storeUint(params.key, 256)
                .endCell(),
        });
    }

    async sendGetAll(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(SettingsOpCodes.anyone_getAll, 32).storeUint(0, 64).endCell(),
        });
    }

    async sendChangeAdmin(provider: ContractProvider, via: Sender, value: bigint, params: ChangeAdminParams) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(SettingsOpCodes.admin_changeAdmin, 32)
                .storeUint(0, 64)
                .storeAddress(params.adminAddress)
                .endCell(),
        });
    }

    async getValue(provider: ContractProvider, key: bigint) {
        const { stack } = await provider.get('get', [{ type: 'int', value: key }]);
        return {
            value: stack.readCellOpt(),
            found: stack.readBoolean(),
        };
    }

    async getAdminAddress(provider: ContractProvider) {
        const { stack } = await provider.get('get_admin_address', []);
        return stack.readAddress();
    }

    async getAll(provider: ContractProvider) {
        const { stack } = await provider.get('get_all', []);
        return stack.readCellOpt();
    }
}
