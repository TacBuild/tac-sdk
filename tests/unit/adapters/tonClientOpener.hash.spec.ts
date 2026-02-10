import { Address, TonClient } from '@ton/ton';

import { TonClientOpener } from '../../../src/adapters/TonClientOpener';
describe('TonClientOpener hash normalization', () => {
    const address = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');

    function createClient(getTransactions = jest.fn().mockResolvedValue([])): TonClient {
        return {
            getTransactions,
        } as unknown as TonClient;
    }

    it('converts 64-char hex hash to base64 before passing to TonClient', async () => {
        const getTransactions = jest.fn().mockResolvedValue([]);
        const opener = new TonClientOpener(createClient(getTransactions));
        const hashHex = 'ab'.repeat(32);

        await opener.getTransactions(address, { limit: 1, lt: '1', hash: hashHex });

        expect(getTransactions).toHaveBeenCalledTimes(1);
        const opts = getTransactions.mock.calls[0][1] as { hash?: string };
        expect(opts.hash).toBe(Buffer.from(hashHex, 'hex').toString('base64'));
    });

    it('keeps base64 hash in base64 form', async () => {
        const getTransactions = jest.fn().mockResolvedValue([]);
        const opener = new TonClientOpener(createClient(getTransactions));
        const hashB64 = Buffer.alloc(32, 0xcd).toString('base64');

        await opener.getTransactions(address, { limit: 1, lt: '1', hash: hashB64 });

        expect(getTransactions).toHaveBeenCalledTimes(1);
        const opts = getTransactions.mock.calls[0][1] as { hash?: string };
        expect(opts.hash).toBe(hashB64);
    });
});
