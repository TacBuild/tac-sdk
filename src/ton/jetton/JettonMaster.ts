import { Address, beginCell, Cell } from '@ton/core';
import type { Contract, ContractProvider } from '@ton/core';
import { fromNano } from '@ton/ton';
import { readJettonMetadata } from './ContentUtils';
import type { JettonExtendedMetadata } from './ContentUtils';

export type JettonMasterData = {
    totalSupply: number;
    mintable: boolean;
    adminAddress: string;
    content: JettonExtendedMetadata;
    jettonWalletCode: Cell;
}

export class JettonMaster implements Contract {
  static create(address: Address) {
    return new JettonMaster(address);
  }

  readonly address: Address;

  constructor(address: Address) {
    this.address = address;
  }

  async getWalletAddress(provider: ContractProvider, owner: string) {
    const res = await provider.get('get_wallet_address', [{ type: 'slice', cell: beginCell().storeAddress(Address.parse(owner)).endCell() }]);
    return res.stack.readAddress().toString();
  }

  async getJettonData(provider: ContractProvider): Promise<JettonMasterData> {
    const result = await provider.get('get_jetton_data', []);
    const totalSupply = Number(fromNano(result.stack.readBigNumber()));
    const mintable = result.stack.readBoolean();
    const adminAddress = result.stack.readAddress().toString();
    const content = await readJettonMetadata(result.stack.readCell());
    const jettonWalletCode = result.stack.readCell();
    return {
      totalSupply,
      mintable,
      adminAddress,
      content,
      jettonWalletCode
    };
  }
}
