import {Address, beginCell, Cell, Contract, ContractProvider} from "@ton/core";
import {fromNano} from "@ton/ton";
import {JettonExtendedMetadata, readJettonMetadata} from "./ContentUtils";

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
        let res = await provider.get('get_wallet_address', [{ type: 'slice', cell: beginCell().storeAddress(Address.parse(owner)).endCell() }]);
        return res.stack.readAddress().toString();
    }

    async getJettonData(provider: ContractProvider): Promise<JettonMasterData> {
        let result = await provider.get('get_jetton_data', []);
        let totalSupply = Number(fromNano(result.stack.readBigNumber()))
        let mintable = result.stack.readBoolean();
        let adminAddress = result.stack.readAddress().toString();
        let content = await readJettonMetadata(result.stack.readCell());
        let jettonWalletCode = result.stack.readCell();
        return {
            totalSupply,
            mintable,
            adminAddress,
            content,
            jettonWalletCode
        };
    }
}