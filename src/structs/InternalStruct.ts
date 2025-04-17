import { Cell } from '@ton/ton';
import {
    ContractOpener,
    TACSimulationResult,
    ExecutionStagesByOperationId,
    Network,
    OperationIdsByShardsKey,
    RawAssetBridgingData,
    StatusInfosByOperationId,
    OperationType,
    AssetType,
} from './Struct';
import { AbstractProvider, ethers, Interface, InterfaceAbi } from 'ethers';
import { mainnet, testnet } from '@tonappchain/artifacts';

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
    JETTON_BURN = 'JETTON_BURN',
    JETTON_TRANSFER = 'JETTON_TRANSFER',
    NFT_BURN = 'NFT_BURN',
    NFT_TRANSFER = 'NFT_TRANSFER',
}

export type RandomNumberByTimestamp = {
    timestamp: number;
    randomNumber: number;
};

export type JettonBridgingData = RawAssetBridgingData & {
    type: AssetType.FT;
    address: string;
};

export type JettonTransferData = JettonBridgingData;

export type JettonBurnData = JettonBridgingData & {
    notificationReceiverAddress: string;
};

export type NFTBridgingData = RawAssetBridgingData & {
    type: AssetType.NFT;
    address: string;
}

export type NFTTransferData = NFTBridgingData & {
    to: string;
    responseAddress: string;
    evmData: Cell;
    crossChainTonAmount?: bigint;
    feeData?: Cell;
};

export type NFTBurnData = NFTBridgingData & {
    notificationReceiverAddress: string;
    evmData: Cell;
    crossChainTonAmount?: bigint;
    feeData?: Cell;
}

export type InternalTONParams = {
    contractOpener: ContractOpener;
    jettonProxyAddress: string;
    nftProxyAddress: string;
    crossChainLayerAddress: string;
    jettonMinterCode: Cell;
    jettonWalletCode: Cell;
    nftItemCode: Cell;
};

export type InternalTACParams = {
    provider: AbstractProvider;
    crossChainLayer: testnet.tac.wrappers.CrossChainLayerTAC | mainnet.tac.wrappers.CrossChainLayerTAC;
    settings: testnet.tac.wrappers.SettingsTAC | testnet.tac.wrappers.SettingsTAC;
    tokenUtils: testnet.tac.wrappers.TokenUtilsTAC | mainnet.tac.wrappers.TokenUtilsTAC;
    trustedTACExecutors: string[],
    trustedTONExecutors: string[],
    abiCoder: ethers.AbiCoder;
    crossChainLayerABI: Interface | InterfaceAbi;
    crossChainLayerTokenABI: Interface | InterfaceAbi;
    crossChainLayerTokenBytecode: string;
};

export type ResponseBase<T> = { response: T };

export type StringResponse = ResponseBase<string>;

export type OperationTypeResponse = ResponseBase<OperationType>;

export type StatusesResponse = ResponseBase<StatusInfosByOperationId>;

export type OperationIdsByShardsKeyResponse = ResponseBase<OperationIdsByShardsKey>;

export type StageProfilingResponse = ResponseBase<ExecutionStagesByOperationId>;

export type TACSimulationResponse = ResponseBase<TACSimulationResult>;
