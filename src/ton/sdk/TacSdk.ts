import { address, Address, beginCell, Cell, OpenedContract, storeStateInit, toNano, TonClient } from '@ton/ton';

// jetton imports
import { JettonMaster } from '../jetton/JettonMaster';
import { JettonWallet } from '../jetton/JettonWallet';

// ton settings
import { Settings } from '../settings/Settings';

// sender abstraction(tonconnect or mnemonic V3R2)
import type { SenderAbstraction } from '../sender_abstraction/SenderAbstraction';

// import structs
import type { TacSDKTonClientParams, TransactionLinker, JettonTransferData, EvmProxyMsg, ShardMessage, ShardTransaction, JettonBurnData, JettonOpGeneralData } from '../structs/Struct';
import { Network, OpCode } from '../structs/Struct';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const TESTNET_TONCENTER_URL_ENDPOINT = 'https://testnet.toncenter.com/api/v2/jsonRPC';
const MAINNET_TONCENTER_URL_ENDPOINT = 'https://toncenter.com/api/v2/jsonRPC';
const TON_SETTINGS_ADDRESS = 'EQCWHoWp-GNyXUm9Ak0jtE7kG4iBhvEGXi7ICEV_WM1QCLfd';

enum JettonOpType {
  Burn = 'Burn',
  Transfer = 'Transfer'
}

export class TacSdk {
  readonly tonClient: TonClient;
  readonly network: Network;
  readonly delay: number;
  readonly settings: OpenedContract<Settings>;

  constructor(TacSDKParams: TacSDKTonClientParams) {
    this.network = TacSDKParams.network ?? Network.Mainnet;
    this.delay = TacSDKParams.delay ?? 0;
    
    const tonClientParameters = TacSDKParams.tonClientParameters ?? {
      endpoint: this.network == Network.Testnet ? TESTNET_TONCENTER_URL_ENDPOINT : MAINNET_TONCENTER_URL_ENDPOINT
    };
    this.tonClient = new TonClient(tonClientParameters);
    this.settings = this.tonClient.open(new Settings(Address.parse(TON_SETTINGS_ADDRESS)));
  }

  async getJettonProxyAddress(): Promise<string> {
    return await this.settings.getAddressSetting('JettonProxyAddress');
  }

  async getCrossChainLayerAddress(): Promise<string> {
    return await this.settings.getAddressSetting('CrossChainLayerAddress');
  }

  async getJettonMinterCode(): Promise<Cell | null> {
    return await this.settings.getCellSetting('JETTON_MINTER_CODE');
  }

  async getJettonWalletCode(): Promise<Cell | null> {
    return await this.settings.getCellSetting('JETTON_WALLET_CODE');
  }

  async getUserJettonWalletAddress(userAddress: string, tokenAddress: string): Promise<string> {
    const jettonMaster = this.tonClient.open(new JettonMaster(Address.parse(tokenAddress)));
    return await jettonMaster.getWalletAddress(userAddress);
  };

  async getUserJettonBalance(userAddress: string, tokenAddress: string): Promise<number> {
    const jettonMaster = this.tonClient.open(new JettonMaster(Address.parse(tokenAddress)));
    const userJettonWalletAddress = await jettonMaster.getWalletAddress(userAddress);
    await sleep(this.delay * 1000);
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
    const forwardAmount = 0.2;

    const payload = beginCell()
      .storeUint(OpCode.JettonTransfer, 32)
      .storeUint(transactionLinker.queryId, 64)
      .storeCoins(toNano(jettonData.jettonAmount.toFixed(9)))
      .storeAddress(Address.parse(jettonProxyAddress))
      .storeAddress(Address.parse(jettonData.fromAddress))
      .storeBit(false)
      .storeCoins(toNano(forwardAmount.toFixed(9)))
      .storeCoins(0)
      .storeMaybeRef(l2Data)
      .endCell();

    return payload;
  };

  private getJettonBurnPayload(transactionLinker : TransactionLinker, jettonData: JettonBurnData, evmProxyMsg: EvmProxyMsg) {
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

    const customPayload = beginCell()
      .storeCoins(toNano(jettonData.tonAmount?.toFixed(9) || 0))
      .storeMaybeRef(
        beginCell().storeStringTail(json).endCell()
      ).endCell();

    const payload = JettonWallet.burnMessage(jettonData.jettonAmount, Address.parse(jettonData.notificationReceieverAddress), customPayload);

    return payload;
  }

  async sendShardJettonTransferTransaction(jettons: JettonTransferData[], evmProxyMsg: EvmProxyMsg, sender: SenderAbstraction): Promise<{transactionLinker: TransactionLinker}> {
    const timestamp = Math.floor(+new Date() / 1000);
    const randAppend = Math.round(Math.random() * 1000);
    const queryId = timestamp + randAppend;
    const shardedId = String(timestamp + Math.round(Math.random() * 1000));
    const jettonProxyAddress = await this.getJettonProxyAddress();

    const transactionLinker : TransactionLinker = {
      caller: Address.normalize(jettons[0].fromAddress),
      queryId,
      shardCount: jettons.length,
      shardedId,
      timestamp
    };

    const messages : ShardMessage[] = [];

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
    const boc = await sender.sendShardTransaction(transaction, this.delay, this.network, this.tonClient);
    return {
      transactionLinker
    };
  };

  async sendShardJettonBurnTransaction(jettons: JettonBurnData[], evmProxyMsg: EvmProxyMsg, sender: SenderAbstraction): Promise<{transactionLinker: TransactionLinker}> {
    const timestamp = Math.floor(+new Date() / 1000);
    const randAppend = Math.round(Math.random() * 1000);
    const queryId = timestamp + randAppend;
    const shardedId = String(timestamp + Math.round(Math.random() * 1000));

    const transactionLinker : TransactionLinker = {
      caller: Address.normalize(jettons[0].fromAddress),
      queryId,
      shardCount: jettons.length,
      shardedId,
      timestamp
    };

    const messages : ShardMessage[] = [];

    for (const jetton of jettons) {
      await sleep(this.delay * 1000);
      const jettonAddress = await this.getUserJettonWalletAddress(jetton.fromAddress, jetton.tokenAddress);
      const payload = this.getJettonBurnPayload(
        transactionLinker,
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
    const boc = await sender.sendShardTransaction(transaction, this.delay, this.network, this.tonClient);
    return {
      transactionLinker
    };
  }

  private async calculateContractAddress(code: Cell, data: Cell) {
    const stateInit = 
      beginCell()
      .store(
        storeStateInit({ code, data })
      ).endCell();
    return new Address(0, stateInit.hash());
  }

  private async detectOpType(jetton: JettonOpGeneralData, cclAddress: Address): Promise<JettonOpType> {
    const protocolJettonMinterCode = await this.getJettonMinterCode();
    if (!protocolJettonMinterCode) throw new Error('unexpected empty jetton minter code. Make sure the settings contract is valid.');
    await sleep(this.delay * 1000);

    const { code: givenMinterCodeBOC } = await this.tonClient.getContractState(address(jetton.tokenAddress));
    if (!givenMinterCodeBOC) throw new Error('unexpected empty contract code of given jetton.');
    const givenMinterCode = Cell.fromBoc(givenMinterCodeBOC)[0];
    await sleep(this.delay * 1000);

    if (!protocolJettonMinterCode.equals(givenMinterCode)) return JettonOpType.Transfer;

    const givenMinter = this.tonClient.open(new JettonMaster(address(jetton.tokenAddress)));

    const protocolJettonWalletCode = await this.getJettonWalletCode();
    if (!protocolJettonWalletCode) throw new Error('unexpected empty jetton wallet code. Make sure the settings contract is valid.');
    await sleep(this.delay * 1000);
    
    const l2Address = await givenMinter.getL2Address();
    if (!l2Address) return JettonOpType.Transfer;
    await sleep(this.delay * 1000);

    const expectedMinterAddress = await this.calculateContractAddress(
      protocolJettonMinterCode,
      beginCell()
        .storeCoins(0)
        .storeAddress(cclAddress)
        .storeRef(beginCell().endCell())
        .storeRef(protocolJettonWalletCode)
        .storeStringTail(l2Address)
      .endCell(),
    );
    if (!expectedMinterAddress.equals(givenMinter.address)) return JettonOpType.Transfer;
    
    return JettonOpType.Burn;
  }

  async sendCrossChainJettonTransaction(jettons: JettonOpGeneralData[],  evmProxyMsg: EvmProxyMsg, sender: SenderAbstraction): Promise<{transactionLinker: TransactionLinker}> {
    const timestamp = Math.floor(+new Date() / 1000);
    const randAppend = Math.round(Math.random() * 1000);
    const queryId = timestamp + randAppend;
    const shardedId = String(timestamp + Math.round(Math.random() * 1000));

    const transactionLinker : TransactionLinker = {
      caller: Address.normalize(jettons[0].fromAddress),
      queryId,
      shardCount: jettons.length,
      shardedId,
      timestamp
    };

    const messages : ShardMessage[] = [];

    for (const jetton of jettons) {
      await sleep(this.delay * 1000);
      const cclAddress = await this.getCrossChainLayerAddress();
      await sleep(this.delay * 1000);

      const opType = await this.detectOpType(jetton, address(cclAddress));
      console.log(`***** Jetton ${jetton.tokenAddress} requires ${opType} operation`);

      let payload: Cell
      switch (opType) {
        case JettonOpType.Burn:
          payload = this.getJettonBurnPayload(
            transactionLinker,
            { notificationReceieverAddress: cclAddress, ...jetton },
            evmProxyMsg
          );
          break;
        case JettonOpType.Transfer:
          const jettonProxyAddress = await this.getJettonProxyAddress();
          payload = this.getJettonTransferPayload(transactionLinker, jettonProxyAddress, jetton, evmProxyMsg);
          break;
      }

      const jettonWalletAddress = await this.getUserJettonWalletAddress(jetton.fromAddress, jetton.tokenAddress);
      await sleep(this.delay * 1000);

      messages.push({
        address: jettonWalletAddress,
        value: Number(((jetton.tonAmount || 0) + 0.35).toFixed(9)),
        payload
      });
    }

    const transaction: ShardTransaction = {
      validUntil: +new Date() + 15 * 60 * 1000,
      messages,
      network: this.network
    };

    console.log('*****Sending transaction: ', transaction);
    const boc = await sender.sendShardTransaction(transaction, this.delay, this.network, this.tonClient);
    return {
      transactionLinker
    };
  }
}
