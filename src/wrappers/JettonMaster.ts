import { Address, Cell, fromNano, Contract, beginCell, contractAddress, ContractProvider } from '@ton/ton';

import type { JettonExtendedMetadata } from './ContentUtils';
import { readJettonMetadata } from './ContentUtils';

export type JettonMasterInitData = {
    evmTokenAddress: string;
    crossChainLayerAddress: Address;
    code: Cell;
    walletCode: Cell;
};

export type JettonMasterData = {
    totalSupply: number;
    mintable: boolean;
    adminAddress: string;
    content: JettonExtendedMetadata;
    jettonWalletCode: Cell;
};

export class JettonMaster implements Contract {
    static createFromAddress(address: Address) {
        return new JettonMaster(address);
    }

    static createFromConfig(config: JettonMasterInitData, workchain = 0) {
        const data = beginCell()
            .storeCoins(0)
            .storeAddress(config.crossChainLayerAddress)
            .storeAddress(null)
            .storeRef(beginCell().endCell())
            .storeRef(config.walletCode)
            .storeStringTail(config.evmTokenAddress)
            .endCell();

        return JettonMaster.createFromAddress(contractAddress(workchain, { data, code: config.code }));
    }

    readonly address: Address;

    constructor(address: Address) {
        this.address = address;
    }

    async getWalletAddress(provider: ContractProvider, owner: string) {
        const res = await provider.get('get_wallet_address', [
            {
                type: 'slice',
                cell: beginCell().storeAddress(Address.parse(owner)).endCell(),
            },
        ]);
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
            jettonWalletCode,
        };
    }

    async getL2Address(provider: ContractProvider): Promise<string> {
        const result = await provider.get('get_l2_token_address', []);
        return result.stack.readString();
    }
}
