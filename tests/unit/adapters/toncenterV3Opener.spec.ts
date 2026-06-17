import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Address, TonClient } from '@ton/ton';

import {
    IToncenterV3Indexer,
    ToncenterV3IndexedTransaction,
    ToncenterV3Opener,
    TransactionTreeDirection,
} from '../../../src';

const okDescription = {
    type: 'generic',
    aborted: false,
    computePh: { skipped: false, success: true, exitCode: 0 },
    action: { success: true, resultCode: 0 },
};

const createHash = (seed: number): string => Buffer.alloc(32, seed).toString('base64');
const createAccount = (seed: number): string => new Address(0, Buffer.alloc(32, seed)).toString();
const createMessage = (hash: string) => ({ hash });

function createTransaction(
    account: string,
    hash: string,
    fields: Partial<ToncenterV3IndexedTransaction> = {},
): ToncenterV3IndexedTransaction {
    return {
        account,
        hash,
        description: okDescription,
        inMsg: null,
        outMsgs: [],
        ...fields,
    };
}

function createIndexer(): jest.Mocked<IToncenterV3Indexer> {
    return {
        endpoint: 'https://toncenter.test/api/v3/',
        getTransactionByHash: jest.fn<IToncenterV3Indexer['getTransactionByHash']>(),
        getTransactionsByMessageHash: jest.fn<IToncenterV3Indexer['getTransactionsByMessageHash']>(),
        getAdjacentTransactions: jest.fn<IToncenterV3Indexer['getAdjacentTransactions']>(),
        findCollectibleCrossChainLayerTransaction: jest.fn<
            IToncenterV3Indexer['findCollectibleCrossChainLayerTransaction']
        >(),
    };
}

describe('ToncenterV3Opener', () => {
    let indexer: jest.Mocked<IToncenterV3Indexer>;
    let opener: ToncenterV3Opener;

    beforeEach(() => {
        indexer = createIndexer();
        opener = new ToncenterV3Opener(indexer, {} as TonClient);

        indexer.getTransactionByHash.mockResolvedValue(null);
        indexer.getTransactionsByMessageHash.mockResolvedValue([]);
        indexer.getAdjacentTransactions.mockResolvedValue([]);
    });

    it('resolves root transaction by inbound message hash', async () => {
        const account = createAccount(1);
        const messageHash = createHash(2);
        const root = createTransaction(account, createHash(3), {
            inMsg: createMessage(messageHash),
        });
        indexer.getTransactionsByMessageHash.mockResolvedValueOnce([root]);

        const result = await opener.trackTransactionTreeWithResult(account, messageHash, {
            retryOnNotFound: false,
        });

        expect(result).toEqual({ success: true, checkedCount: 1 });
        expect(indexer.getTransactionByHash).toHaveBeenCalledWith(messageHash);
        expect(indexer.getTransactionsByMessageHash).toHaveBeenCalledWith(messageHash, 'in');
        expect(indexer.getTransactionsByMessageHash).toHaveBeenCalledTimes(1);
    });

    it('walks forward only through child transactions returned by Toncenter v3', async () => {
        const rootAccount = createAccount(1);
        const childAccount = createAccount(2);
        const parentAccount = createAccount(3);
        const childMessageHash = createHash(4);
        const parentMessageHash = createHash(5);
        const child = createTransaction(childAccount, createHash(6), {
            inMsg: { hash: childMessageHash },
        });
        const parent = createTransaction(parentAccount, createHash(7), {
            outMsgs: [createMessage(parentMessageHash)],
        });
        const root = createTransaction(rootAccount, createHash(8), {
            inMsg: createMessage(parentMessageHash),
            outMsgs: [createMessage(childMessageHash)],
        });

        indexer.getTransactionByHash.mockResolvedValue(root);
        indexer.getAdjacentTransactions.mockResolvedValueOnce([child, parent]);

        const result = await opener.trackTransactionTreeWithResult(rootAccount, root.hash, {
            maxDepth: 1,
            retryOnNotFound: false,
        });

        expect(result).toEqual({ success: true, checkedCount: 2 });
        expect(indexer.getAdjacentTransactions).toHaveBeenCalledWith(root.hash);
    });

    it('walks backward only through parent transactions returned by Toncenter v3', async () => {
        const rootAccount = createAccount(1);
        const childAccount = createAccount(2);
        const parentAccount = createAccount(3);
        const childMessageHash = createHash(4);
        const parentMessageHash = createHash(5);
        const child = createTransaction(childAccount, createHash(6), {
            inMsg: createMessage(childMessageHash),
        });
        const parent = createTransaction(parentAccount, createHash(7), {
            outMsgs: [createMessage(parentMessageHash)],
        });
        const root = createTransaction(rootAccount, createHash(8), {
            inMsg: createMessage(parentMessageHash),
            outMsgs: [createMessage(childMessageHash)],
        });

        indexer.getTransactionByHash.mockResolvedValue(root);
        indexer.getAdjacentTransactions.mockResolvedValueOnce([child, parent]);

        const result = await opener.trackTransactionTreeWithResult(rootAccount, root.hash, {
            direction: TransactionTreeDirection.BACKWARD,
            maxDepth: 1,
            retryOnNotFound: false,
        });

        expect(result).toEqual({ success: true, checkedCount: 2 });
        expect(indexer.getAdjacentTransactions).toHaveBeenCalledWith(root.hash);
    });

    it('returns action phase validation error from indexed transaction phases', async () => {
        const account = createAccount(1);
        const root = createTransaction(account, createHash(2), {
            description: {
                type: 'generic',
                aborted: false,
                computePh: {
                    skipped: false,
                    success: true,
                    exitCode: 0,
                },
                action: {
                    success: false,
                    resultCode: 37,
                },
            },
        });
        indexer.getTransactionByHash.mockResolvedValue(root);

        const result = await opener.trackTransactionTreeWithResult(account, root.hash, {
            retryOnNotFound: false,
        });

        expect(result).toEqual({
            success: false,
            checkedCount: 1,
            error: {
                txHash: root.hash,
                exitCode: 0,
                resultCode: 37,
                reason: 'action_phase_failed',
            },
        });
    });

    it('returns not_found when v3 cannot resolve the root transaction or message', async () => {
        const account = createAccount(1);
        const missingHash = createHash(2);

        const result = await opener.trackTransactionTreeWithResult(account, missingHash, {
            retryOnNotFound: false,
        });

        expect(result).toEqual({
            success: false,
            checkedCount: 0,
            error: {
                txHash: missingHash,
                exitCode: 'N/A',
                resultCode: 'N/A',
                reason: 'not_found',
                address: account,
            },
        });
        expect(indexer.getTransactionsByMessageHash).toHaveBeenCalledWith(missingHash, 'in');
        expect(indexer.getTransactionsByMessageHash).toHaveBeenCalledWith(missingHash, 'out');
    });
});
