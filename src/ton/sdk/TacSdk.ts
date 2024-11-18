import { Address, beginCell, Cell, toNano, TonClient } from '@ton/ton';

// jetton imports
import { JettonMaster } from '../jetton/JettonMaster';
import { JettonWallet } from '../jetton/JettonWallet';

// ton settings
import { Settings } from '../settings/Settings';

// sender abstraction(tonconnect or mnemonic V3R2)
import type { SenderAbstraction } from '../sender_abstraction/SenderAbstraction';

// import structs
import type { TacSDKTonClientParams, TransactionLinker, JettonTransferData, EvmProxyMsg, TransferMessage, ShardTransaction } from '../structs/Struct';
import { Network, OpCode } from '../structs/Struct';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const TESTNET_TONCENTER_URL_ENDPOINT = 'https://testnet.toncenter.com/api/v2/jsonRPC';
const MAINNET_TONCENTER_URL_ENDPOINT = 'https://toncenter.com/api/v2/jsonRPC';
const TON_SETTINGS_ADDRESS = 'EQCWHoWp-GNyXUm9Ak0jtE7kG4iBhvEGXi7ICEV_WM1QCLfd';

export class TacSdk {
  readonly tonClient: TonClient;
  readonly network: Network;
  readonly delay: number;

  constructor(TacSDKParams: TacSDKTonClientParams) {
    this.network = TacSDKParams.network ?? Network.Mainnet;
    this.delay = TacSDKParams.delay ?? 0;
    
    const tonClientParameters = TacSDKParams.tonClientParameters ?? {
      endpoint: this.network == Network.Testnet ? TESTNET_TONCENTER_URL_ENDPOINT : MAINNET_TONCENTER_URL_ENDPOINT
    };
    this.tonClient = new TonClient(tonClientParameters);
  }

  async getJettonProxyAddress(): Promise<string> {
    const settings = this.tonClient.open(new Settings(Address.parse(TON_SETTINGS_ADDRESS)));
    return await settings.getAddressSetting('JettonProxyAddress');
  }

  async getUserJettonWalletAddress(userAddress: string, tokenAddress: string): Promise<string> {
    const jettonMaster = this.tonClient.open(new JettonMaster(Address.parse(tokenAddress)));
    return await jettonMaster.getWalletAddress(userAddress);
  };

  async getUserJettonBalance(userAddress: string, tokenAddress: string): Promise<number> {
    const jettonMaster = this.tonClient.open(new JettonMaster(Address.parse(tokenAddress)));
    const userJettonWalletAddress = await jettonMaster.getWalletAddress(userAddress);
    const userJettonWallet = this.tonClient.open(new JettonWallet(Address.parse(userJettonWalletAddress)));
    return await userJettonWallet.getJettonBalance();
  };

  private getJettonTransferPayload(transactionLinker : TransactionLinker, jettonProxyAddress: string, jettonData: JettonTransferData, evmProxyMsg: EvmProxyMsg): Cell {
    const evmArguments = Buffer.from(evmProxyMsg.encodedParameters.split('0x')[1], 'hex').toString('base64');

    const json = JSON.stringify({
      evm_call: {
        target: evmProxyMsg.evmTargetAddress,
        method_name: evmProxyMsg.methodName,
        arguments: evmArguments
      },
      sharded_id: transactionLinker.shardedId,
      shard_count: transactionLinker.shardCount
    });

    const l2Data = beginCell().storeStringTail(json).endCell();
    const forwardAmount = '0.2';

    const payload = beginCell()
      .storeUint(OpCode.JettonTransfer, 32)
      .storeUint(transactionLinker.queryId, 64)
      .storeCoins(toNano(jettonData.jettonAmount.toFixed(9)))
      .storeAddress(Address.parse(jettonProxyAddress))
      .storeAddress(Address.parse(jettonData.fromAddress))
      .storeBit(false)
      .storeCoins(toNano(forwardAmount))
      .storeCoins(0)
      .storeMaybeRef(l2Data)
      .endCell();

    return payload;
  };

  async sendShardJettonTransferTransaction(jettons: JettonTransferData[], evmProxyMsg: EvmProxyMsg, sender: SenderAbstraction): Promise<{transactionLinker: TransactionLinker}> {
    const timestamp = Math.floor(+new Date() / 1000);
    const randAppend = Math.round(Math.random() * 1000);
    const queryId = timestamp + randAppend;
    const shardedId = String(timestamp + Math.round(Math.random() * 1000));
    const jettonProxyAddress = await this.getJettonProxyAddress();

    const transactionLinker : TransactionLinker = {
      caller: jettons[0].fromAddress,
      queryId,
      shardCount: jettons.length,
      shardedId,
      timestamp
    };

    const messages : TransferMessage[] = [];

    for (const jetton of jettons) {
      await sleep(this.delay * 1000);
      const jettonAddress = await this.getUserJettonWalletAddress(jetton.fromAddress, jetton.tokenAddress);
      const payload = this.getJettonTransferPayload(
        transactionLinker,
        jettonProxyAddress,
        jetton,
        evmProxyMsg
      );

      messages.push({
        address: jettonAddress,
        value: jetton.tonAmount ?? 0.35,
        payload
      });
    }

    const transaction: ShardTransaction = {
      validUntil: +new Date() + 15 * 60 * 1000,
      messages,
      network: this.network
    };

    console.log('*****Sending transaction: ', transaction);
    const boc = await sender.sendShardJettonTransferTransaction(transaction, this.delay, this.network, this.tonClient);
    return {
      transactionLinker
    };
  };
}
