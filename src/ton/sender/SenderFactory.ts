import {
  WalletContractV1R1,
  WalletContractV1R2,
  WalletContractV1R3,
  WalletContractV2R1,
  WalletContractV2R2,
  WalletContractV3R1,
  WalletContractV3R2,
  WalletContractV4,
  WalletContractV5R1,
} from "@ton/ton";
import { SenderAbstraction } from "./SenderAbstraction";
import { mnemonicToWalletKey } from "ton-crypto";
import { RawSender } from "./RawSender";
import { TonConnectUI } from "@tonconnect/ui";
import { TonConnectSender } from "./TonConnectSender";

export type WalletVersion =
  | "v1r1"
  | "v1r2"
  | "v1r3"
  | "v2r1"
  | "v2r2"
  | "v3r1"
  | "v3r2"
  | "v4"
  | "v5r1";

const wallets = {
  v1r1: WalletContractV1R1,
  v1r2: WalletContractV1R2,
  v1r3: WalletContractV1R3,
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
          version: WalletVersion;
          mnemonic: string;
        }
      | { tonConnect: TonConnectUI }
  ): Promise<SenderAbstraction> {
    if ('tonConnect' in params) {
      return new TonConnectSender(params.tonConnect)
    }


    if (!(params.version in wallets)) {
      throw new Error(`Unknown wallet version ${params.version}`);
    }

    const keypair = await mnemonicToWalletKey(params.mnemonic.split(" "));
    const wallet = wallets[params.version].create({
      workchain: 0,
      publicKey: keypair.publicKey,
    });

    return new RawSender(wallet, keypair.secretKey);
  }
}
