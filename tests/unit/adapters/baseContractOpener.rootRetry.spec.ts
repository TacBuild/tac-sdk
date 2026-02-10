import { SandboxContract } from '@ton/sandbox';
import { Address, Contract, OpenedContract, Transaction } from '@ton/ton';

import { BaseContractOpener } from '../../../src/adapters/BaseContractOpener';
import { AddressInformation, ContractState, GetTransactionsOptions } from '../../../src/structs/Struct';

jest.mock('../../../src/sdk/Utils', () => {
    const actual = jest.requireActual('../../../src/sdk/Utils');
    return {
        ...actual,
        sleep: jest.fn().mockResolvedValue(undefined),
    };
});

class RootRetryTestOpener extends BaseContractOpener {
    constructor() {
        super();
    }

    public addressInfoImpl = jest.fn<Promise<AddressInformation>, [Address]>(async () => ({
        lastTransaction: { lt: '', hash: '' },
    }));

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
        void opts;
        return [];
    }

    async getAddressInformation(address: Address): Promise<AddressInformation> {
        return this.addressInfoImpl(address);
    }

    async getConfig(): Promise<string> {
        return '';
    }
}

describe('BaseContractOpener root retry strategy', () => {
    const address = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');

    const setFindByHashType = (
        opener: RootRetryTestOpener,
        mock: (address: Address, hash: string, hashType: 'unknown' | 'in' | 'out' | undefined, opts: GetTransactionsOptions) => Promise<Transaction | null>,
    ) => {
        Reflect.set(opener as object, 'findTransactionByHashType', mock);
    };

    const invokeFindRoot = async (
        opener: RootRetryTestOpener,
        hash: string,
    ): Promise<Transaction | null> => {
        const fn = Reflect.get(opener as object, 'findRootTransactionWithRetry') as (
            address: Address,
            hash: string,
            hashType: 'unknown' | 'in' | 'out' | undefined,
            limit: number,
            maxScannedTransactions: number,
            waitForRootTransaction: boolean,
        ) => Promise<Transaction | null>;

        return fn.call(opener, address, hash, 'unknown', 10, 100, true);
    };

    it('captures baseline then searches immediately on first attempt', async () => {
        const opener = new RootRetryTestOpener();
        const tx = {} as Transaction;
        const searchMock = jest.fn().mockResolvedValue(tx);
        setFindByHashType(opener, searchMock);

        const result = await invokeFindRoot(opener, 'hash');

        expect(result).toBe(tx);
        expect(searchMock).toHaveBeenCalledTimes(1);
        expect(opener.addressInfoImpl).toHaveBeenCalledTimes(1);
    });

    it('does not run extra searches when lt does not change', async () => {
        const opener = new RootRetryTestOpener();
        const searchMock = jest.fn().mockResolvedValue(null);
        setFindByHashType(opener, searchMock);
        opener.addressInfoImpl.mockResolvedValue({
            lastTransaction: { lt: '100', hash: Buffer.alloc(32, 1).toString('base64') },
        });

        const result = await invokeFindRoot(opener, 'hash');

        expect(result).toBeNull();
        expect(searchMock).toHaveBeenCalledTimes(1);
        expect(opener.addressInfoImpl).toHaveBeenCalledTimes(60);
    });

    it('resumes searching when lt changes and finds transaction', async () => {
        const opener = new RootRetryTestOpener();
        const tx = {} as Transaction;
        const searchMock = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(tx);
        setFindByHashType(opener, searchMock);

        opener.addressInfoImpl
            .mockResolvedValueOnce({
                lastTransaction: { lt: '100', hash: Buffer.alloc(32, 1).toString('base64') },
            })
            .mockResolvedValueOnce({
                lastTransaction: { lt: '100', hash: Buffer.alloc(32, 1).toString('base64') },
            })
            .mockResolvedValueOnce({
                lastTransaction: { lt: '100', hash: Buffer.alloc(32, 1).toString('base64') },
            })
            .mockResolvedValueOnce({
                lastTransaction: { lt: '101', hash: Buffer.alloc(32, 2).toString('base64') },
            });

        const result = await invokeFindRoot(opener, 'hash');

        expect(result).toBe(tx);
        expect(searchMock).toHaveBeenCalledTimes(2);
    });

    it('runs exactly one additional search after lt change', async () => {
        const opener = new RootRetryTestOpener();
        const tx = {} as Transaction;
        const searchMock = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(tx);
        setFindByHashType(opener, searchMock);

        opener.addressInfoImpl
            .mockResolvedValueOnce({
                lastTransaction: { lt: '100', hash: Buffer.alloc(32, 1).toString('base64') },
            })
            .mockResolvedValueOnce({
                lastTransaction: { lt: '101', hash: Buffer.alloc(32, 2).toString('base64') },
            });

        const result = await invokeFindRoot(opener, 'hash');

        expect(result).toBe(tx);
        expect(searchMock).toHaveBeenCalledTimes(2);
    });
});
