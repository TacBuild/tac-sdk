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

import { unknownWalletError } from '../errors';
import { Network } from '../structs/Struct';
import { DEFAULT_SUBWALLET_ID, DEFAULT_TIMEOUT, HighloadWalletV3 } from '../wrappers/HighloadWalletV3';
import { BatchSender } from './BatchSender';
import { RawSender } from './RawSender';
import { SenderAbstraction } from './SenderAbstraction';
import { TonConnectSender } from './TonConnectSender';

export type WalletVersion = 'V2R1' | 'V2R2' | 'V3R1' | 'V3R2' | 'V4' | 'V5R1' | 'HIGHLOAD_V3';

export const wallets = {
    V2R1: WalletContractV2R1,
    V2R2: WalletContractV2R2,
    V3R1: WalletContractV3R1,
    V3R2: WalletContractV3R2,
    V4: WalletContractV4,
    V5R1: WalletContractV5R1,
    HIGHLOAD_V3: HighloadWalletV3,
};

export class SenderFactory {
    static async getSender(
        params:
            | {
                  network: Network;
                  version: WalletVersion;
                  mnemonic: string;
                  options?: {
                      v5r1?: {
                          subwalletNumber?: number;
                      };
                      highloadV3?: {
                          subwalletId?: number;
                          timeout?: number;
                      };
                  };
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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const config: { workchain: number; publicKey: Buffer; walletId?: any; subwalletId?: number; timeout?: number } =
            {
                workchain: 0,
                publicKey: keypair.publicKey,
                walletId: undefined, // for w5
                subwalletId: undefined, // for highload v3
                timeout: undefined, // for highload v3
            };

        if (params.version === 'V5R1') {
            // manual setup of wallet id required to support wallet w5 both on mainnet and testnet
            config.walletId = {
                networkGlobalId: params.network === Network.TESTNET ? -3 : -239,
                context: {
                    walletVersion: 'v5r1',
                    workchain: 0,
                    subwalletNumber: params.options?.v5r1?.subwalletNumber ?? 0,
                },
            };
        }

        if (params.version === 'HIGHLOAD_V3') {
            config.subwalletId = params.options?.highloadV3?.subwalletId ?? DEFAULT_SUBWALLET_ID;
            config.timeout = params.options?.highloadV3?.timeout ?? DEFAULT_TIMEOUT;
        }

        const wallet = wallets[params.version].create(config);

        if (params.version === 'HIGHLOAD_V3') {
            return new BatchSender(wallet as HighloadWalletV3, keypair.secretKey);
        }

        return new RawSender(wallet, keypair.secretKey, params.version === 'V5R1' ? 254 : 4);
    }
}
