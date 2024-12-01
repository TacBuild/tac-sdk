import { address, Address, beginCell, Cell, OpenedContract, storeStateInit, toNano, TonClient } from '@ton/ton';

// jetton imports
import { JettonMaster } from '../jetton/JettonMaster';
import { JettonWallet } from '../jetton/JettonWallet';

// ton settings
import { Settings } from '../settings/Settings';

// sender abstraction(tonconnect or mnemonic V3R2)
import type { SenderAbstraction } from '../sender_abstraction/SenderAbstraction';

// import structs
import type { TacSDKTonClientParams, TransactionLinker, JettonTransferData, EvmProxyMsg, ShardMessage, ShardTransaction, JettonBurnData, JettonOperationGeneralData } from '../structs/Struct';
import { Network, OpCode, JettonOpType } from '../structs/Struct';
import { ethers } from 'ethers';
import ITokenUtils from '../../abi/ITokenUtils.json';


export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const DEFAULT_DELAY = 3;

const TESTNET_TONCENTER_URL_ENDPOINT = 'https://testnet.toncenter.com/api/v2/jsonRPC';
const MAINNET_TONCENTER_URL_ENDPOINT = 'https://toncenter.com/api/v2/jsonRPC';
const TON_SETTINGS_ADDRESS = 'EQCWHoWp-GNyXUm9Ak0jtE7kG4iBhvEGXi7ICEV_WM1QCLfd';
const TAC_RPC_ENDPOINT = 'https://newyork-inap-72-251-230-233.ankr.com/tac_tacd_testnet_full_rpc_1';
const TAC_TOKENUTILS_ADDRESS = '0x6838517aa554353ab83887F131d0bF7046bAE214';
const TAC_SETTINGS_ADDRESS = '0xfb5Aac4a7780f59a52aaB68b4b01Ff20ec34C6a2';

export class TacSdk {
  readonly tonClient: TonClient;
  readonly network: Network;
  readonly delay: number;
  readonly settings: OpenedContract<Settings>;

  constructor(TacSDKParams: TacSDKTonClientParams) {
    this.network = TacSDKParams.network;
    this.delay = TacSDKParams.tonClientParameters
      ? TacSDKParams.delay ?? 0
      : DEFAULT_DELAY;
    
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

  private async calculateContractAddress(code: Cell, data: Cell) {
    const stateInit = 
      beginCell()
      .store(
        storeStateInit({ code, data })
      ).endCell();
    return new Address(0, stateInit.hash());
  }

  private async detectOpType(jetton: JettonOperationGeneralData, cclAddress: Address): Promise<JettonOpType> {
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

  async sendCrossChainJettonTransaction(jettons: JettonOperationGeneralData[],  evmProxyMsg: EvmProxyMsg, sender: SenderAbstraction): Promise<{transactionLinker: TransactionLinker}> {
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

    const jettonProxyAddress = await this.getJettonProxyAddress();
    await sleep(this.delay * 1000);

    for (const jetton of jettons) {
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

  async calculateEVMTokenAddress(tvmTokenAddress: string): Promise<string> {
    const protocolJettonMinterCode = await this.getJettonMinterCode();
    await sleep(this.delay * 1000);

    const { code: givenMinterCodeBOC } = await this.tonClient.getContractState(address(tvmTokenAddress));
    if (
      givenMinterCodeBOC &&
      protocolJettonMinterCode?.equals(Cell.fromBoc(givenMinterCodeBOC)[0])
    ) {
      const givenMinter = this.tonClient.open(
        new JettonMaster(address(tvmTokenAddress))
      );
      const tokenL2Address = await givenMinter.getL2Address();
      await sleep(this.delay * 1000);
      if (tokenL2Address) {
        return tokenL2Address;
      }
    }

    const tokenUtilsContract = new ethers.Contract(
      TAC_TOKENUTILS_ADDRESS,
      ITokenUtils.abi,
      ethers.getDefaultProvider(TAC_RPC_ENDPOINT)
    );

    const tokenL2Address = await tokenUtilsContract.computeAddress(
      tvmTokenAddress,
      TAC_SETTINGS_ADDRESS
    );

    return tokenL2Address;
  }
}
