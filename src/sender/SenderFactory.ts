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
import { DEFAULT_SUBWALLET_ID, DEFAULT_TIMEOUT, HighloadWalletV3 } from '../wrappers/HighloadWalletV3';

export type WalletVersion = 'v2r1' | 'v2r2' | 'v3r1' | 'v3r2' | 'v4' | 'v5r1' | 'highloadV3';

export const wallets = {
    v2r1: WalletContractV2R1,
    v2r2: WalletContractV2R2,
    v3r1: WalletContractV3R1,
    v3r2: WalletContractV3R2,
    v4: WalletContractV4,
    v5r1: WalletContractV5R1,
    highloadV3: HighloadWalletV3,
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

        const config: { workchain: number; publicKey: Buffer; walletId: any; subwalletId: any; timeout: any } = {
            workchain: 0,
            publicKey: keypair.publicKey,
            walletId: undefined, // for w5
            subwalletId: undefined, // for highload v3
            timeout: undefined, // for highload v3
        };

        if (params.version === 'v5r1') {
            // manual setup of wallet id required to support wallet w5 both on mainnet and testnet
            config.walletId = {
                networkGlobalId: params.network === Network.Testnet ? -3 : -239,
                context: { walletVersion: 'v5r1', workchain: 0, subwalletNumber: 0 },
            };
        }

        if (params.version === 'highloadV3') {
            config.subwalletId = DEFAULT_SUBWALLET_ID;
            config.timeout = DEFAULT_TIMEOUT;
        }

        const wallet = wallets[params.version].create(config);

        return new RawSender(wallet, keypair.secretKey);
    }
}
