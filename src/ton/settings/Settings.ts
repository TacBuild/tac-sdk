import { Address } from '@ton/core';
import type { Contract, ContractProvider } from '@ton/core';
import { ethers } from 'ethers';

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
    const address = cell ? cell.beginParse().loadAddress().toString() : '';
    return address;
  }
}
