import { SandboxContract } from '@ton/sandbox';
import { Address, Contract, OpenedContract, Transaction } from '@ton/ton';

import { BaseContractOpener } from '../../../src/adapters/BaseContractOpener';
import { AddressInformation, ContractState, GetTransactionsOptions } from '../../../src/structs/Struct';

class PaginationTestOpener extends BaseContractOpener {
    public readonly calls: GetTransactionsOptions[] = [];
    private readonly pages: Transaction[][];

    constructor(pages: Transaction[][]) {
        super();
        this.pages = pages;
    }

    open<T extends Contract>(contract: T): OpenedContract<T> | SandboxContract<T> {
        void contract;
        throw new Error('Not implemented');
    }

    async getContractState(address: Address): Promise<ContractState> {
        void address;
        throw new Error('Not implemented');
    }

    async getTransactions(address: Address, opts: GetTransactionsOptions): Promise<Transaction[]> {
        void address;
        this.calls.push(opts);
        return this.pages.shift() ?? [];
    }

    async getAddressInformation(address: Address): Promise<AddressInformation> {
        void address;
        throw new Error('Not implemented');
    }

    async getConfig(): Promise<string> {
        return '';
    }
}

function makeTx(hashByte: number, lt: bigint, prevLt: bigint, prevHashHex: string): Transaction {
    return {
        hash: () => Buffer.alloc(32, hashByte),
        lt,
        prevTransactionLt: prevLt,
        prevTransactionHash: BigInt(`0x${prevHashHex}`),
        inMessage: undefined,
        outMessages: new Map(),
    } as unknown as Transaction;
}

describe('BaseContractOpener scan pagination', () => {
    const address = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');

    it('passes 32-byte cursor hash to the next page when prevTransactionHash is valid', async () => {
        const firstTx = makeTx(1, 100n, 123n, 'bb'.repeat(32));
        const secondTx = makeTx(2, 99n, 0n, 'cc'.repeat(32));
        const opener = new PaginationTestOpener([[firstTx], [secondTx]]);
        const targetHash = secondTx.hash().toString('base64');

        const result = await opener.getTransactionByTxHash(address, targetHash, { limit: 1 });
        expect(result).toBe(secondTx);
        expect(opener.calls).toHaveLength(2);

        const secondCallHash = opener.calls[1].hash;
        expect(secondCallHash).toBeDefined();
        expect(Buffer.from(secondCallHash!, 'base64').length).toBe(32);
        expect(Buffer.from(secondCallHash!, 'base64').toString('hex')).toBe('01'.repeat(32));
    });

    it('stops scanning after 100 transactions', async () => {
        const txs: Transaction[] = [];
        for (let i = 0; i < 101; i++) {
            txs.push(makeTx(i + 1, BigInt(1000 - i), 0n, 'aa'.repeat(32)));
        }

        const opener = new PaginationTestOpener([txs]);
        const targetHash = txs[100].hash().toString('base64');

        const result = await opener.getTransactionByTxHash(address, targetHash, { limit: 101 });
        expect(result).toBeNull();
        expect(opener.calls).toHaveLength(1);
    });

    it('supports custom maxScannedTransactions override', async () => {
        const txs: Transaction[] = [];
        for (let i = 0; i < 101; i++) {
            txs.push(makeTx(i + 1, BigInt(2000 - i), 0n, 'aa'.repeat(32)));
        }

        const opener = new PaginationTestOpener([txs]);
        const targetHash = txs[100].hash().toString('base64');

        const result = await opener.getTransactionByTxHash(address, targetHash, {
            limit: 101,
            maxScannedTransactions: 101,
        });
        expect(result).toBe(txs[100]);
    });
});
