import { beginCell } from '@ton/ton';
import type { TonConnectUI } from '@tonconnect/ui';

import { SenderFactory } from '../../src/sender/SenderFactory';
import type { ShardTransaction } from '../../src/structs/InternalStruct';
import { Network } from '../../src/structs/Struct';

jest.mock('@tonconnect/ui', () => {
    throw new Error('@tonconnect/ui must not be imported at runtime');
});

describe('TonConnectSender', () => {
    it.each([
        [Network.MAINNET, '-239'],
        [Network.TESTNET, '-3'],
    ])('sends a %s transaction through TonConnect UI v3', async (network, tonConnectNetwork) => {
        const payload = beginCell().storeUint(1, 1).endCell();
        const response = { boc: 'signed-transaction-boc' };
        const sendTransaction = jest.fn().mockResolvedValue(response);
        const tonConnect = {
            account: null,
            wallet: null,
            sendTransaction,
        } as unknown as TonConnectUI;
        const sender = await SenderFactory.getSender({ tonConnect });
        const transaction: ShardTransaction = {
            network,
            validUntil: 1_800_000_000,
            messages: [
                {
                    address: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
                    value: 1000000000n,
                    payload,
                    extra: { tonNetworkFee: 0n },
                },
            ],
        };

        const result = await sender.sendShardTransaction(transaction, network);

        expect(sendTransaction).toHaveBeenCalledWith({
            validUntil: transaction.validUntil,
            network: tonConnectNetwork,
            messages: [
                {
                    address: transaction.messages[0].address,
                    amount: transaction.messages[0].value.toString(),
                    payload: payload.toBoc().toString('base64'),
                },
            ],
        });
        expect(result).toEqual({
            success: true,
            result: response,
            boc: response.boc,
            lastMessageIndex: 0,
        });
    });
});
