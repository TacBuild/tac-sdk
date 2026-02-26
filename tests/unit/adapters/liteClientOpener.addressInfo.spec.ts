import { Address } from '@ton/ton';

import { LiteClientOpener } from '../../../src/adapters/LiteClientOpener';
import { ILogger } from '../../../src/interfaces';

describe('LiteClientOpener getAddressInformation', () => {
    const address = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');

    function createOpener(client: unknown, logger?: ILogger): LiteClientOpener {
        const Ctor = LiteClientOpener as unknown as {
            new (clientArg: unknown, engineArg: { close: () => void }, loggerArg?: ILogger): LiteClientOpener;
        };
        return new Ctor(client, { close: () => undefined }, logger);
    }

    it('returns canonical 32-byte base64 hash for last transaction', async () => {
        const hashHex = '0f'.repeat(31) + '01';
        const shortBigInt = BigInt(`0x${hashHex}`); // has potential leading-zero shrink in toString(16)
        const client = {
            getMasterchainInfo: jest.fn().mockResolvedValue({ last: {} }),
            getAccountState: jest.fn().mockResolvedValue({
                lastTx: { lt: 123n, hash: shortBigInt },
            }),
        };

        const opener = createOpener(client);
        const info = await opener.getAddressInformation(address);

        expect(info.lastTransaction.lt).toBe('123');
        expect(Buffer.from(info.lastTransaction.hash, 'base64').length).toBe(32);
        expect(Buffer.from(info.lastTransaction.hash, 'base64').toString('hex')).toBe(hashHex);
    });
});
