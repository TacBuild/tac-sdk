import {
  Address,
  beginCell,
  Cell,
  contractAddress,
  fromNano,
  SendMode,
  toNano
} from '@ton/core';

import type {
  Contract,
  ContractProvider,
  Sender
} from '@ton/core';

export type JettonWalletData = {
    balance: number;
    ownerAddress: string;
    jettonMasterAddress: string;
    jettonWalletCode: Cell;
}

export enum JettonWalletOpCodes {
    burn = 0x595F07BC,
    transfer = 0xF8A7EA5,
}

export function jettonWalletConfigToCell(config: JettonWalletData): Cell {
  return beginCell()
    .storeCoins(toNano(config.balance.toFixed(9)))
    .storeAddress(Address.parse(config.ownerAddress))
    .storeAddress(Address.parse(config.jettonMasterAddress))
    .endCell();
}

export class JettonWallet implements Contract {
  constructor(
        readonly address: Address,
        readonly init?: { code: Cell, data: Cell }
  ) {
  }

  static createFromAddress(address: Address) {
    return new JettonWallet(address);
  }

  static createFromConfig(config: JettonWalletData, code: Cell, workchain = 0) {
    const data = jettonWalletConfigToCell(config);
    const init = { code, data };
    return new JettonWallet(contractAddress(workchain, init), init);
  }

  static burnMessage(
    jettonAmount: number,
    receiverAddress?: Address,
    forwardPayload?: Cell | null,
    queryId: number = 0
  ) {
    const body = beginCell()
      .storeUint(JettonWalletOpCodes.burn, 32)
      .storeUint(queryId, 64)
      .storeCoins(toNano(jettonAmount.toFixed(9)));

    if (receiverAddress) {
      body.storeAddress(receiverAddress);
    }

    if (forwardPayload) {
      body.storeMaybeRef(forwardPayload);
    }

    return body.endCell();
  }

  async sendBurn(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    opts: {
      queryId?: number;
      jettonAmount: number;
      receiverAddress?: Address;
      forwardPayload?: Cell | null;
    }
  ) {
    const body = JettonWallet.burnMessage(
      opts.jettonAmount,
      opts.receiverAddress,
      opts.forwardPayload,
      opts.queryId
    );

    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: body,
    });
  }

  static transferMessage(
    jetton_amount: bigint,
    to: Address,
    responseAddress: Address | null,
    customPayload: Cell | null,
    forwardTonAmount: bigint,
    forwardPayload: Cell | null,
    queryId?: number
  ) {
    return beginCell()
      .storeUint(JettonWalletOpCodes.transfer, 32)
      .storeUint(queryId ?? 0, 64)
      .storeCoins(jetton_amount)
      .storeAddress(to)
      .storeAddress(responseAddress)
      .storeMaybeRef(customPayload)
      .storeCoins(forwardTonAmount)
      .storeMaybeRef(forwardPayload)
      .endCell();
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
        }
  ) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(JettonWalletOpCodes.transfer, 32)
        .storeUint(opts.queryId || 0, 64)
        .storeCoins(toNano(opts.jettonAmount.toFixed(9)))
        .storeAddress(Address.parse(opts.toOwnerAddress))
        .storeAddress(opts.responseAddress ? Address.parse(opts.responseAddress) : null)
        .storeMaybeRef(opts.customPayload)
        .storeCoins(toNano(opts.forwardTonAmount?.toFixed(9) || 0))
        .storeMaybeRef(opts.forwardPayload)
        .endCell()
    });
  }

  async getWalletData(provider: ContractProvider): Promise<JettonWalletData> {
    const result = await provider.get('get_wallet_data', []);
    return {
      balance: Number(fromNano(result.stack.readBigNumber())),
      ownerAddress: result.stack.readAddress().toString(),
      jettonMasterAddress: result.stack.readAddress().toString(),
      jettonWalletCode: result.stack.readCell()
    };
  }

  async getJettonBalance(provider: ContractProvider): Promise<number> {
    const state = await provider.getState();
    if (state.state.type !== 'active') {
      return 0;
    }
    const result = await provider.get('get_wallet_data', []);
    return Number(fromNano(result.stack.readBigNumber()));
  }
}
