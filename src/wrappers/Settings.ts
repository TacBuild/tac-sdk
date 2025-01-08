import type { Cell, Contract, ContractProvider } from '@ton/core';
import { Address } from '@ton/core';
import { ethers } from 'ethers';
import { emptySettingError } from '../errors';

export class Settings implements Contract {
    static create(address: Address) {
        return new Settings(address);
    }

    readonly address: Address;

    constructor(address: Address) {
        this.address = address;
    }

    getKeyFromString(ContractName: string): bigint {
        const hash = ethers.sha256(ethers.toUtf8Bytes(ContractName));
        return ethers.toBigInt(hash);
    }

    async getAddressSetting(provider: ContractProvider, ContractName: string) {
        const key = this.getKeyFromString(ContractName);
        const { stack } = await provider.get('get', [{ type: 'int', value: key }]);
        const cell = stack.readCellOpt();
        const found = stack.readBoolean();
        if (!found) {
            return '';
        }
        return cell ? cell.beginParse().loadAddress().toString() : '';
    }

    async getCellSetting(provider: ContractProvider, setting: string): Promise<Cell> {
        const key = this.getKeyFromString(setting);
        const { stack } = await provider.get('get', [{ type: 'int', value: key }]);
        const cell = stack.readCellOpt();
        const found = stack.readBoolean();
        if (!found || cell == null) {
            throw emptySettingError(setting);
        }
        return cell;
    }
}
