import { Address, beginCell, TonClient, Transaction } from '@ton/ton';

import { TonClientOpener, TransactionTreeDirection } from '../../../src';
import { GetTransactionsOptions } from '../../../src';

type TonClientMock = {
    tryLocateResultTx: jest.Mock<Promise<Transaction>, [Address, Address, string]>;
    tryLocateSourceTx: jest.Mock<Promise<Transaction>, [Address, Address, string]>;
};

describe('TonClientOpener archival tree lookup', () => {
    const address = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');
    const childAddress = Address.parse('EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N');

    const createOpener = () => {
        const client: TonClientMock = {
            tryLocateResultTx: jest.fn(),
            tryLocateSourceTx: jest.fn(),
        };

        return {
            opener: new TonClientOpener(client as unknown as TonClient),
            client,
        };
    };

    const setFindByHashType = (
        opener: TonClientOpener,
        mock: (
            address: Address,
            hash: string,
            hashType: 'unknown' | 'in' | 'out' | undefined,
            opts: GetTransactionsOptions,
        ) => Promise<Transaction | null>,
    ) => {
        Reflect.set(opener as object, 'findTransactionByHashType', mock);
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

    const createInternalMessage = (source: Address, destination: Address, createdLt: bigint) =>
        ({
            info: {
                type: 'internal',
                ihrDisabled: true,
                bounce: false,
                bounced: false,
                src: source,
                dest: destination,
                value: { coins: 1n },
                ihrFee: 0n,
                forwardFee: 0n,
                createdLt,
                createdAt: 0,
            },
            init: null,
            body: beginCell().endCell(),
        }) as never;

    it('uses Toncenter v2 result locate during archival forward tree traversal', async () => {
        const { opener, client } = createOpener();
        const outMessage = createInternalMessage(address, childAddress, 456n);
        const rootTx = successfulTransaction(Buffer.alloc(32, 7), new Map([[0, outMessage]]));
        const childTx = successfulTransaction(Buffer.alloc(32, 8), new Map(), outMessage);
        const searchMock = jest.fn().mockResolvedValue(rootTx);
        setFindByHashType(opener, searchMock);
        client.tryLocateResultTx.mockResolvedValue(childTx);

        const result = await opener.trackTransactionTreeWithResult(
            address.toString(),
            rootTx.hash().toString('base64'),
            {
                archival: true,
                maxDepth: 1,
                retryOnNotFound: false,
            },
        );

        expect(result).toEqual({ success: true, checkedCount: 2 });
        expect(searchMock).toHaveBeenCalledTimes(1);
        expect(client.tryLocateResultTx).toHaveBeenCalledTimes(1);
        expect(client.tryLocateResultTx.mock.calls[0][0].toString()).toBe(address.toString());
        expect(client.tryLocateResultTx.mock.calls[0][1].toString()).toBe(childAddress.toString());
        expect(client.tryLocateResultTx.mock.calls[0][2]).toBe('456');
    });

    it('falls back to hash lookup when located child transaction does not match the message hash', async () => {
        const { opener, client } = createOpener();
        const outMessage = createInternalMessage(address, childAddress, 456n);
        const rootTx = successfulTransaction(Buffer.alloc(32, 7), new Map([[0, outMessage]]));
        const mismatchedChildTx = successfulTransaction(Buffer.alloc(32, 8));
        const foundChildTx = successfulTransaction(Buffer.alloc(32, 9));
        const searchMock = jest.fn().mockResolvedValueOnce(rootTx).mockResolvedValueOnce(foundChildTx);
        setFindByHashType(opener, searchMock);
        client.tryLocateResultTx.mockResolvedValue(mismatchedChildTx);

        const result = await opener.trackTransactionTreeWithResult(
            address.toString(),
            rootTx.hash().toString('base64'),
            {
                archival: true,
                maxDepth: 1,
                retryOnNotFound: false,
            },
        );

        expect(result).toEqual({ success: true, checkedCount: 2 });
        expect(client.tryLocateResultTx).toHaveBeenCalledTimes(1);
        expect(searchMock).toHaveBeenCalledTimes(2);
    });

    it('uses Toncenter v2 source locate during archival backward tree traversal', async () => {
        const { opener, client } = createOpener();
        const inMessage = createInternalMessage(childAddress, address, 789n);
        const rootTx = successfulTransaction(Buffer.alloc(32, 7), new Map(), inMessage);
        const parentTx = successfulTransaction(Buffer.alloc(32, 8), new Map([[0, inMessage]]));
        const searchMock = jest.fn().mockResolvedValue(rootTx);
        setFindByHashType(opener, searchMock);
        client.tryLocateSourceTx.mockResolvedValue(parentTx);

        const result = await opener.trackTransactionTreeWithResult(
            address.toString(),
            rootTx.hash().toString('base64'),
            {
                archival: true,
                direction: TransactionTreeDirection.BACKWARD,
                maxDepth: 1,
                retryOnNotFound: false,
            },
        );

        expect(result).toEqual({ success: true, checkedCount: 2 });
        expect(searchMock).toHaveBeenCalledTimes(1);
        expect(client.tryLocateSourceTx).toHaveBeenCalledTimes(1);
        expect(client.tryLocateSourceTx.mock.calls[0][0].toString()).toBe(childAddress.toString());
        expect(client.tryLocateSourceTx.mock.calls[0][1].toString()).toBe(address.toString());
        expect(client.tryLocateSourceTx.mock.calls[0][2]).toBe('789');
    });

    it('does not use Toncenter locate calls when archival lookup is not requested', async () => {
        const { opener, client } = createOpener();
        const outMessage = createInternalMessage(address, childAddress, 456n);
        const rootTx = successfulTransaction(Buffer.alloc(32, 7), new Map([[0, outMessage]]));
        const childTx = successfulTransaction(Buffer.alloc(32, 8), new Map(), outMessage);
        const searchMock = jest.fn().mockResolvedValueOnce(rootTx).mockResolvedValueOnce(childTx);
        setFindByHashType(opener, searchMock);

        const result = await opener.trackTransactionTreeWithResult(
            address.toString(),
            rootTx.hash().toString('base64'),
            {
                maxDepth: 1,
                retryOnNotFound: false,
            },
        );

        expect(result).toEqual({ success: true, checkedCount: 2 });
        expect(client.tryLocateResultTx).not.toHaveBeenCalled();
        expect(client.tryLocateSourceTx).not.toHaveBeenCalled();
    });
});
