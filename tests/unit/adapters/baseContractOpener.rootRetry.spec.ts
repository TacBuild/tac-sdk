import { SandboxContract } from '@ton/sandbox';
import { Address, Contract, OpenedContract, Transaction } from '@ton/ton';

import { BaseContractOpener } from '../../../src';
import { AddressInformation, ContractState, GetTransactionsOptions } from '../../../src';

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
        mock: (
            address: Address,
            hash: string,
            hashType: 'unknown' | 'in' | 'out' | undefined,
            opts: GetTransactionsOptions,
        ) => Promise<Transaction | null>,
    ) => {
        Reflect.set(opener as object, 'findTransactionByHashType', mock);
    };

    const invokeFindRoot = async (opener: RootRetryTestOpener, hash: string): Promise<Transaction | null> => {
        const fn = Reflect.get(opener as object, 'findTransactionWithRetry') as (
            address: Address,
            hash: string,
            hashType: 'unknown' | 'in' | 'out' | undefined,
            opts: GetTransactionsOptions,
            depth: number,
        ) => Promise<Transaction | null>;

        return fn.call(opener, address, hash, 'unknown', { limit: 10, maxScannedTransactions: 100 }, 0);
    };

    const successfulTransaction = (
        hash = Buffer.alloc(32, 7),
        outMessages = new Map<number, unknown>(),
        inMessage?: unknown,
    ): Transaction =>
        ({
            hash: () => hash,
            description: {
                type: 'generic',
                aborted: false,
                computePhase: {
                    type: 'vm',
                    success: true,
                    exitCode: 0,
                },
                actionPhase: {
                    success: true,
                    resultCode: 0,
                },
            },
            inMessage,
            outMessages,
        }) as unknown as Transaction;

    it('captures baseline then searches immediately on first attempt', async () => {
        const opener = new RootRetryTestOpener();
        const tx = {} as Transaction;
        const searchMock = jest.fn().mockResolvedValue(tx);
        setFindByHashType(opener, searchMock);

        const result = await invokeFindRoot(opener, 'hash');

        expect(result).toBe(tx);
        expect(searchMock).toHaveBeenCalledTimes(1);
        expect(opener.addressInfoImpl).not.toHaveBeenCalled();
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
        expect(searchMock).toHaveBeenCalledTimes(11);
        expect(opener.addressInfoImpl).not.toHaveBeenCalled();
    });

    it('resumes searching when lt changes and finds transaction', async () => {
        const opener = new RootRetryTestOpener();
        const tx = {} as Transaction;
        const searchMock = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(tx);
        setFindByHashType(opener, searchMock);

        const result = await invokeFindRoot(opener, 'hash');

        expect(result).toBe(tx);
        expect(searchMock).toHaveBeenCalledTimes(2);
    });

    it('runs exactly one additional search after lt change', async () => {
        const opener = new RootRetryTestOpener();
        const tx = {} as Transaction;
        const searchMock = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(tx);
        setFindByHashType(opener, searchMock);

        const result = await invokeFindRoot(opener, 'hash');

        expect(result).toBe(tx);
        expect(searchMock).toHaveBeenCalledTimes(2);
    });

    it('propagates provider errors instead of converting them to not_found', async () => {
        const opener = new RootRetryTestOpener();
        const providerError = Object.assign(new Error('Request failed with status code 542'), {
            response: { status: 542 },
        });
        const searchMock = jest.fn().mockRejectedValue(providerError);
        setFindByHashType(opener, searchMock);

        await expect(invokeFindRoot(opener, 'hash')).rejects.toBe(providerError);
        expect(searchMock).toHaveBeenCalledTimes(1);
    });

    it('does not send archival option by default while tracking a transaction tree', async () => {
        const opener = new RootRetryTestOpener();
        const tx = successfulTransaction();
        const searchMock = jest.fn().mockResolvedValue(tx);
        setFindByHashType(opener, searchMock);

        const result = await opener.trackTransactionTreeWithResult(address.toString(), tx.hash().toString('base64'), {
            retryOnNotFound: false,
        });

        expect(result.success).toBe(true);
        expect(searchMock).toHaveBeenCalledTimes(1);
        expect(searchMock.mock.calls[0][3]).not.toHaveProperty('archival');
    });

    it('uses archival lookup when transaction tree params request it', async () => {
        const opener = new RootRetryTestOpener();
        const tx = successfulTransaction();
        const searchMock = jest.fn().mockResolvedValue(tx);
        setFindByHashType(opener, searchMock);

        const result = await opener.trackTransactionTreeWithResult(address.toString(), tx.hash().toString('base64'), {
            archival: true,
            retryOnNotFound: false,
        });

        expect(result.success).toBe(true);
        expect(searchMock).toHaveBeenCalledTimes(1);
        expect(searchMock.mock.calls[0][3].archival).toBe(true);
    });

    it('starts root transaction lookup from provided logical time', async () => {
        const opener = new RootRetryTestOpener();
        const tx = successfulTransaction();
        const txHash = tx.hash().toString('base64');
        const searchMock = jest.fn().mockResolvedValue(tx);
        setFindByHashType(opener, searchMock);

        const result = await opener.trackTransactionTreeWithResult(address.toString(), txHash, {
            rootLt: '123',
            retryOnNotFound: false,
        });

        expect(result.success).toBe(true);
        expect(searchMock).toHaveBeenCalledTimes(1);
        expect(searchMock.mock.calls[0][3]).toEqual(
            expect.objectContaining({
                lt: '123',
                hash: txHash,
                inclusive: true,
            }),
        );
    });
});
