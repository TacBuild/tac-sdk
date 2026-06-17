import type { Address, Cell, Message } from '@ton/ton';
import { AbstractProvider, ethers } from 'ethers';

import { ICrossChainLayer, ISAFactory, ISettings, ITokenUtils } from '../../artifacts/tacTypes';
import { ContractOpener, IToncenterV3Indexer } from '../interfaces';
import {
    CurrencyType,
    ExecutionStagesByOperationId,
    ExecutionStagesV2ByOperationId,
    Network,
    OperationIdsByShardsKey,
    OperationIdWithLogIndex,
    OperationType,
    OperationTypeV2Info,
    StatusInfosByOperationId,
    SuggestedTVMExecutorFee,
    TACSimulationResult,
    ToncenterV3IndexedTransaction,
    TransactionLinker,
} from './Struct';

export type ShardMessage = {
    address: string;
    value: bigint;
    payload: Cell;
    extra: {
        tonNetworkFee: bigint;
        tacEstimatedGas?: bigint;
    };
};

export type ShardTransaction = {
    validUntil: number;
    messages: ShardMessage[];
    network: Network;
};

export type PreparedCrossChainTransaction = {
    transaction: ShardTransaction;
    transactionLinker: TransactionLinker;
};

export type PreparedBridgeTokensToTON = {
    outMessagePayload: ethers.BytesLike;
    totalValue: bigint;
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
    tonIndexer?: IToncenterV3Indexer;
    jettonProxyAddress: string;
    nftProxyAddress: string;
    crossChainLayerAddress: string;
    jettonMinterCode: Cell;
    jettonWalletCode: Cell;
    nftItemCode: Cell;
    nftCollectionCode: Cell;
    feesParams: TONFeesParams;
    contractFeeUsageParams: ContractFeeUsageParams;
};

export type InternalTACParams = {
    provider: AbstractProvider;
    crossChainLayer: ICrossChainLayer;
    settings: ISettings;
    tokenUtils: ITokenUtils;
    smartAccountFactory: ISAFactory;
    trustedTACExecutors: string[];
    trustedTONExecutors: string[];
    abiCoder: ethers.AbiCoder;
};

export type ResponseBase<T> = { response: T };

export type StringResponse = ResponseBase<string>;

export type OperationTypeResponse = ResponseBase<OperationType>;

export type OperationTypeV2Response = ResponseBase<OperationTypeV2Info>;

export type StatusesResponse = ResponseBase<StatusInfosByOperationId>;

export type OperationIdsByShardsKeyResponse = ResponseBase<OperationIdsByShardsKey>;

export type StageProfilingResponse = ResponseBase<ExecutionStagesByOperationId>;

export type StageProfilingV2Response = ResponseBase<ExecutionStagesV2ByOperationId>;

export type TACSimulationResponse = ResponseBase<TACSimulationResult>;

export type SuggestedTVMExecutorFeeResponse = ResponseBase<SuggestedTVMExecutorFee>;

export type ConvertCurrencyResponse = ResponseBase<ConvertedCurrencyRawResult>;

export type OperationIdWithLogIndexResponse = ResponseBase<OperationIdWithLogIndex[]>;

export interface SendResult {
    success: boolean;
    boc: string;
    result?: unknown;
    error?: Error;
    lastMessageIndex?: number;
}

export type SendGroupTransferResult = string | { result: string };

export type SendBatchTransferResult = string | void | { result: string | void };

export type RetryableOperationResult<T> = {
    success: boolean;
    data?: T;
    lastError?: Error;
};

export type MetadataPersistenceType =
    | 'none'
    | 'onchain'
    | 'offchain_private_domain'
    | 'offchain_ipfs'
    | 'semichain_private_domain'
    | 'semichain_ipfs';

export type OffchainMetadataResult<TMetadata = unknown> = {
    metadata: TMetadata | null;
    isIpfs: boolean;
    contentUri: string;
};

export type ReadMetadataResult<TMetadata = unknown> = {
    persistenceType: MetadataPersistenceType;
    metadata: TMetadata | null;
    contentUri?: string;
    isJettonDeployerFaultyOnChainData?: boolean;
};

export type ToncenterTransaction = {
    description: {
        aborted: boolean;
        action?: {
            resultCode: number;
            success: boolean;
        };
        computePh?: {
            exitCode: number;
            success: boolean;
        };
        destroyed: boolean;
    };
    hash: string;
    inMsg: {
        hash: string;
        opcode: string;
        value: string;
    };
    outMsgs: {
        hash: string;
    }[];
};

export type TransactionDepth = {
    address?: Address;
    hash: string;
    depth: number;
    hashType?: 'unknown' | 'in' | 'out';
};

export type TransactionQueueItem = {
    address: Address;
    hash: string;
    depth: number;
    hashType: 'unknown' | 'in' | 'out';
    message?: Message;
};

export type AdjacentTransactionsResponse = {
    transactions: ToncenterTransaction[];
};

export type TonAdjacentTransactionsResponse = {
    transactions: ToncenterV3IndexedTransaction[];
};

export type ToncenterV3TransactionsResponse = {
    transactions: ToncenterV3IndexedTransaction[];
};

export type TxFinalizerConfig = {
    urlBuilder: (hash: string) => string;
    authorization?: { header: string; value: string };
};

export type USDPriceInfoRaw = {
    spot: string;
    ema: string;
    decimals: number;
};
export type ConvertedCurrencyRawResult = {
    spotValue: string;
    emaValue: string;
    decimals: number;
    currency: CurrencyType;
    tacPrice: USDPriceInfoRaw;
    tonPrice: USDPriceInfoRaw;
};

export type TONFeesParams = {
    accountBitPrice: number;
    accountCellPrice: number;
    lumpPrice: number;
    gasPrice: number;
    firstFrac: number;
    ihrPriceFactor: number;
    msgBitPrice: number;
    msgCellPrice: number;
};

export type ContractFeeUsageParams = {
    crossChainLayer: {
        accountBits: number;
        accountCells: number;
        gas: {
            tvmMsgToEvm: number;
        };
    };
    jettonWallet: {
        accountBits: number;
        accountCells: number;
        estimatedAccountBits: number;
        estimatedAccountCells: number;
        initStateBits: number;
        initStateCells: number;
        gas: {
            internalTransfer: number;
            receive: number;
            burn: number;
            estimatedSendTransfer: number;
            estimatedReceiveTransfer: number;
        };
    };
    jettonProxy: {
        accountBits: number;
        accountCells: number;
        gas: {
            transferNotification: number;
            errorNotification: number;
        };
    };
    jettonMinter: {
        accountBits: number;
        accountCells: number;
        gas: {
            burnNotification: number;
            mintAfterError: number;
        };
    };
    nftItem: {
        accountBits: number;
        accountCells: number;
        estimatedAccountBits: number;
        estimatedAccountCells: number;
        gas: {
            send: number;
            burn: number;
            errorNotification: number;
        };
    };
    nftProxy: {
        accountBits: number;
        accountCells: number;
        gas: {
            ownershipAssigned: number;
            errorNotification: number;
        };
    };
};

export type TransactionFeeCalculationStep = {
    accountBits: number;
    accountCells: number;
    gasUsed: number;
    msgBits: number;
    msgCells: number;
    timeDelta: number;
};

export type TONFeeCalculationParams = TransactionFeeCalculationStep & TONFeesParams;

export type TacGasPriceResponse = {
    gasPrices: {
        average: number;
        fast: number;
        slow: number;
    };
};
