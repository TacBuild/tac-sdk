import { Address } from "@ton/core";
import type { Contract, ContractProvider } from "@ton/core";
import { createHash } from 'crypto';
import { ethers } from 'ethers';

export class Settings implements Contract {

    static create(address: Address) {
        return new Settings(address);
    }

    readonly address: Address;

    constructor(address: Address) {
        this.address = address;
    }

    async getKeyFromString(ContractName: string): Promise<bigint> {
        const hash = createHash('sha256').update(ContractName).digest();
        return ethers.toBigInt(hash);
    }
      
    async getAddressSetting(provider: ContractProvider, ContractName: string) {
        const key = await this.getKeyFromString(ContractName)
        const { stack } = await provider.get('get', [{ type: 'int', value: key }]);
        const cell = stack.readCellOpt();
        const found = stack.readBoolean();
        if (!found) {
            return "";
        }
        const address = cell ? cell.beginParse().loadAddress().toString(): "";
        return address;
    }
}