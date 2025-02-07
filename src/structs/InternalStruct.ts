import { Cell } from '@ton/ton';
import { ContractOpener, Network, RawAssetBridgingData } from './Struct';
import { AbstractProvider, ethers, Interface, InterfaceAbi } from 'ethers';

export type ShardMessage = {
    address: string;
    value: bigint;
    payload: Cell;
};

export type ShardTransaction = {
    validUntil: number;
    messages: ShardMessage[];
    network: Network;
};

export enum AssetOpType {
    JettonBurn = 'JettonBurn',
    JettonTransfer = 'JettonTransfer',
}

export type RandomNumberByTimestamp = {
    timestamp: number;
    randomNumber: number;
};

export type JettonBridgingData = RawAssetBridgingData & {
    address: string;
};

export type JettonTransferData = JettonBridgingData;

export type JettonBurnData = JettonBridgingData & {
    notificationReceiverAddress: string;
};

export type InternalTONParams = {
    contractOpener: ContractOpener;
    jettonProxyAddress: string;
    crossChainLayerAddress: string;
    jettonMinterCode: Cell;
    jettonWalletCode: Cell;
};

export type InternalTACParams = {
    provider: AbstractProvider;
    settingsAddress: string;
    abiCoder: ethers.AbiCoder;
    crossChainLayerABI: Interface | InterfaceAbi;
    crossChainLayerAddress: string;
    crossChainLayerTokenABI: Interface | InterfaceAbi;
    crossChainLayerTokenBytecode: string;
    customLiteSequencerEndpoints: string[];
};
