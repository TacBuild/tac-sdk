import {
    WalletContractV2R1,
    WalletContractV2R2,
    WalletContractV3R1,
    WalletContractV3R2,
    WalletContractV4,
    WalletContractV5R1,
} from '@ton/ton';
import { TonConnectUI } from '@tonconnect/ui';
import { mnemonicToWalletKey } from 'ton-crypto';

import { RawSender } from './RawSender';
import { SenderAbstraction } from './SenderAbstraction';
import { TonConnectSender } from './TonConnectSender';
import { unknownWalletError } from '../errors';
import { Network } from '../structs/Struct';

export type WalletVersion = 'v2r1' | 'v2r2' | 'v3r1' | 'v3r2' | 'v4' | 'v5r1';

export const wallets = {
    v2r1: WalletContractV2R1,
    v2r2: WalletContractV2R2,
    v3r1: WalletContractV3R1,
    v3r2: WalletContractV3R2,
    v4: WalletContractV4,
    v5r1: WalletContractV5R1,
};

export class SenderFactory {
    static async getSender(
        params:
            | {
                  network: Network;
                  version: WalletVersion;
                  mnemonic: string;
              }
            | { tonConnect: TonConnectUI },
    ): Promise<SenderAbstraction> {
        if ('tonConnect' in params) {
            return new TonConnectSender(params.tonConnect);
        }

        if (!(params.version in wallets)) {
            throw unknownWalletError(params.version);
        }

        const keypair = await mnemonicToWalletKey(params.mnemonic.split(' '));

        const config: { workchain: number; publicKey: Buffer; walletId?: any } = {
            workchain: 0,
            publicKey: keypair.publicKey,
        };
        if (params.version === 'v5r1') {
            // manual setup of wallet id required to support wallet w5 both on mainnet and testnet
            config.walletId = {
                networkGlobalId: params.network === Network.Testnet ? -3 : -239,
                context: { walletVersion: 'v5r1', workchain: 0, subwalletNumber: 0 },
            };
        }

        const wallet = wallets[params.version].create(config);

        return new RawSender(wallet, keypair.secretKey);
    }
}
