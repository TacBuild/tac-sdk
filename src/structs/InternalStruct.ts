import { Cell } from '@ton/ton';
import { mainnet, testnet } from '@tonappchain/artifacts';
import { AbstractProvider, ethers } from 'ethers';

import {
    ContractOpener,
    ExecutionStagesByOperationId,
    Network,
    OperationIdsByShardsKey,
    OperationType,
    StatusInfosByOperationId,
    SuggestedTONExecutorFee,
    TACSimulationResult,
    CurrencyType,
} from './Struct';

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

export type InternalTONParams = {
    contractOpener: ContractOpener;
    jettonProxyAddress: string;
    nftProxyAddress: string;
    crossChainLayerAddress: string;
    jettonMinterCode: Cell;
    jettonWalletCode: Cell;
    nftItemCode: Cell;
    nftCollectionCode: Cell;
};

export type InternalTACParams = {
    provider: AbstractProvider;
    crossChainLayer: testnet.tac.wrappers.CrossChainLayerTAC | mainnet.tac.wrappers.CrossChainLayerTAC;
    settings: testnet.tac.wrappers.SettingsTAC | mainnet.tac.wrappers.SettingsTAC;
    tokenUtils: testnet.tac.wrappers.TokenUtilsTAC | mainnet.tac.wrappers.TokenUtilsTAC;
    trustedTACExecutors: string[];
    trustedTONExecutors: string[];
    abiCoder: ethers.AbiCoder;
};

export type ResponseBase<T> = { response: T };

export type StringResponse = ResponseBase<string>;

export type OperationTypeResponse = ResponseBase<OperationType>;

export type StatusesResponse = ResponseBase<StatusInfosByOperationId>;

export type OperationIdsByShardsKeyResponse = ResponseBase<OperationIdsByShardsKey>;

export type StageProfilingResponse = ResponseBase<ExecutionStagesByOperationId>;

export type TACSimulationResponse = ResponseBase<TACSimulationResult>;

export type SuggestedTONExecutorFeeResponse = ResponseBase<SuggestedTONExecutorFee>;

export type ConvertCurrencyResponse = ResponseBase<ConvertedCurrencyRawResult>;

export interface SendResult {
    success: boolean;
    result?: unknown;
    error?: Error;
    lastMessageIndex?: number;
}

export type ToncenterTransaction = {
    description: {
        aborted: boolean;
        action: {
            resultCode: number;
            success: boolean;
        };
        computePh: {
            exitCode: number;
            success: boolean;
        };
        destroyed: boolean;
    };
    hash: string;
    inMsg: {
        hash: string;
        opcode: string;
    };
};

export type TransactionDepth = {
    hash: string;
    depth: number;
};

export type AdjacentTransactionsResponse = {
    transactions: ToncenterTransaction[];
};

export type TxFinalizerConfig = {
    urlBuilder: (hash: string) => string;
    authorization: { header: string; value: string };
};

export type TokenPriceInfoRaw = {
    spot: string;
    ema: string;
};
export type ConvertedCurrencyRawResult = {
    spotRawValue: string;
    spotFriendlyValue: string;
    emaValue: string;
    emaFriendlyValue: string;
    spotValueInUSD: string;
    emaValueInUSD: string;
    currencyType: CurrencyType;
    tacPrice: TokenPriceInfoRaw;
    tonPrice: TokenPriceInfoRaw;
};
