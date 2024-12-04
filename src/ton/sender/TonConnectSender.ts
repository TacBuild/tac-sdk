import { CHAIN, TonConnectUI } from "@tonconnect/ui";
import type { SendTransactionRequest } from "@tonconnect/ui";
import { toNano } from "@ton/ton";
import { Base64 } from "@tonconnect/protocol";
import { Network } from "../structs/Struct";
import type { ShardTransaction } from "../structs/Struct";
import { SenderAbstraction, sleep } from "./SenderAbstraction";

export class TonConnectSender implements SenderAbstraction {
  readonly tonConnect: TonConnectUI;

  constructor(tonConnect: TonConnectUI) {
    this.tonConnect = tonConnect;
  }

  getSenderAddress(): string {
    return this.tonConnect.account?.address?.toString() || "";
  }

  async sendShardTransaction(
    shardTransaction: ShardTransaction,
    delay: number,
    chain: Network
  ) {
    const messages = [];
    for (const message of shardTransaction.messages) {
      messages.push({
        address: message.address,
        amount: toNano(message.value.toFixed(9)).toString(),
        payload: Base64.encode(message.payload.toBoc()).toString(),
      });
    }

    const transaction: SendTransactionRequest = {
      validUntil: shardTransaction.validUntil,
      messages,
      network: chain == Network.Testnet ? CHAIN.TESTNET : CHAIN.MAINNET,
    };

    await sleep(delay * 1000);
    await this.tonConnect.sendTransaction(transaction);
  }
}
