import { ContractFeeUsageParams, TransactionFeeCalculationStep } from '../structs/InternalStruct';
import { ONE_YEAR_SECONDS } from './Consts';

export const FIXED_POINT_SHIFT = 2 ** 16;

/**
 * Default contract fee usage parameters used as fallback.
 */
export const DEFAULT_CONTRACT_FEE_USAGE_PARAMS: ContractFeeUsageParams = {
    crossChainLayer: {
        accountBits: 43514,
        accountCells: 100,
        gas: {
            tvmMsgToEvm: 14619,
        },
    },
    jettonWallet: {
        accountBits: 949,
        accountCells: 3,
        estimatedAccountBits: 11000,
        estimatedAccountCells: 25,
        initStateBits: 847,
        initStateCells: 3,
        gas: {
            internalTransfer: 10669,
            receive: 11427,
            burn: 8653,
            estimatedSendTransfer: 11000,
            estimatedReceiveTransfer: 12000,
        },
    },
    jettonProxy: {
        accountBits: 7760,
        accountCells: 16,
        gas: {
            ownershipAssigned: 8515,
            transferNotification: 8515,
            errorNotification: 5556,
        },
    },
    jettonMinter: {
        accountBits: 10208,
        accountCells: 28,
        gas: {
            burnNotification: 10357,
            mintAfterError: 9654,
        },
    },
    nftItem: {
        accountBits: 1422,
        accountCells: 5,
        gas: {
            send: 11722,
            burn: 11552,
            errorNotification: 4638,
        },
    },
    nftProxy: {
        accountBits: 7512,
        accountCells: 15,
        gas: {
            ownershipAssigned: 7688,
            errorNotification: 4737,
        },
    },
};

export const createCrossChainLayerTvmMsgToEvmStep = (
    params: ContractFeeUsageParams,
    msgBits: number,
    msgCells: number,
): TransactionFeeCalculationStep => ({
    accountBits: params.crossChainLayer.accountBits,
    accountCells: params.crossChainLayer.accountCells,
    gasUsed: params.crossChainLayer.gas.tvmMsgToEvm,
    msgBits,
    msgCells,
    timeDelta: ONE_YEAR_SECONDS,
});

export const createJettonWalletInternalTransferStep = (
    params: ContractFeeUsageParams,
    msgBits: number,
    msgCells: number,
): TransactionFeeCalculationStep => ({
    accountBits: params.jettonWallet.accountBits,
    accountCells: params.jettonWallet.accountCells,
    gasUsed: params.jettonWallet.gas.internalTransfer,
    msgBits,
    msgCells,
    timeDelta: ONE_YEAR_SECONDS,
});

export const createJettonWalletReceiveStep = (
    params: ContractFeeUsageParams,
    msgBits: number,
    msgCells: number,
): TransactionFeeCalculationStep => ({
    accountBits: params.jettonWallet.accountBits,
    accountCells: params.jettonWallet.accountCells,
    gasUsed: params.jettonWallet.gas.receive,
    msgBits,
    msgCells,
    timeDelta: ONE_YEAR_SECONDS,
});

export const createJettonWalletBurnStep = (
    params: ContractFeeUsageParams,
    msgBits: number,
    msgCells: number,
): TransactionFeeCalculationStep => ({
    accountBits: params.jettonWallet.accountBits,
    accountCells: params.jettonWallet.accountCells,
    gasUsed: params.jettonWallet.gas.burn,
    msgBits,
    msgCells,
    timeDelta: ONE_YEAR_SECONDS,
});

export const createJettonProxyOwnershipAssignedStep = (
    params: ContractFeeUsageParams,
    msgBits: number,
    msgCells: number,
): TransactionFeeCalculationStep => ({
    accountBits: params.jettonProxy.accountBits,
    accountCells: params.jettonProxy.accountCells,
    gasUsed: params.jettonProxy.gas.ownershipAssigned,
    msgBits,
    msgCells,
    timeDelta: ONE_YEAR_SECONDS,
});

export const createJettonMinterBurnNotificationStep = (
    params: ContractFeeUsageParams,
    msgBits: number,
    msgCells: number,
): TransactionFeeCalculationStep => ({
    accountBits: params.jettonMinter.accountBits,
    accountCells: params.jettonMinter.accountCells,
    gasUsed: params.jettonMinter.gas.burnNotification,
    msgBits,
    msgCells,
    timeDelta: ONE_YEAR_SECONDS,
});

export const createNftItemSendStep = (
    params: ContractFeeUsageParams,
    msgBits: number,
    msgCells: number,
): TransactionFeeCalculationStep => ({
    accountBits: params.nftItem.accountBits,
    accountCells: params.nftItem.accountCells,
    gasUsed: params.nftItem.gas.send,
    msgBits,
    msgCells,
    timeDelta: ONE_YEAR_SECONDS,
});

export const createNftItemBurnStep = (
    params: ContractFeeUsageParams,
    msgBits: number,
    msgCells: number,
): TransactionFeeCalculationStep => ({
    accountBits: params.nftItem.accountBits,
    accountCells: params.nftItem.accountCells,
    gasUsed: params.nftItem.gas.burn,
    msgBits,
    msgCells,
    timeDelta: ONE_YEAR_SECONDS,
});

export const createNftProxyOwnershipAssignedStep = (
    params: ContractFeeUsageParams,
    msgBits: number,
    msgCells: number,
): TransactionFeeCalculationStep => ({
    accountBits: params.nftProxy.accountBits,
    accountCells: params.nftProxy.accountCells,
    gasUsed: params.nftProxy.gas.ownershipAssigned,
    msgBits,
    msgCells,
    timeDelta: ONE_YEAR_SECONDS,
});

export const createErrorNotificationGasStep = (
    params: ContractFeeUsageParams,
    msgBits: number,
    msgCells: number,
): TransactionFeeCalculationStep => ({
    accountBits: 0,
    accountCells: 0,
    gasUsed: params.jettonProxy.gas.errorNotification,
    msgBits,
    msgCells,
    timeDelta: 0,
});

export const createEstimatedSendTransferGasStep = (
    params: ContractFeeUsageParams,
    msgBits: number,
    msgCells: number,
): TransactionFeeCalculationStep => ({
    accountBits: 0,
    accountCells: 0,
    gasUsed: params.jettonWallet.gas.estimatedSendTransfer,
    msgBits,
    msgCells,
    timeDelta: 0,
});

export const createEstimatedReceiveTransferGasStep = (
    params: ContractFeeUsageParams,
    msgBits: number,
    msgCells: number,
): TransactionFeeCalculationStep => ({
    accountBits: 0,
    accountCells: 0,
    gasUsed: params.jettonWallet.gas.estimatedReceiveTransfer,
    msgBits,
    msgCells,
    timeDelta: 0,
});

export const createMintAfterErrorGasStep = (
    params: ContractFeeUsageParams,
    msgBits: number,
    msgCells: number,
): TransactionFeeCalculationStep => ({
    accountBits: params.jettonMinter.accountBits,
    accountCells: params.jettonMinter.accountCells,
    gasUsed: params.jettonMinter.gas.mintAfterError,
    msgBits,
    msgCells,
    timeDelta: ONE_YEAR_SECONDS,
});

export const createNftProxyErrorNotificationStep = (
    params: ContractFeeUsageParams,
    msgBits: number,
    msgCells: number,
): TransactionFeeCalculationStep => ({
    accountBits: 0,
    accountCells: 0,
    gasUsed: params.nftProxy.gas.errorNotification,
    msgBits,
    msgCells,
    timeDelta: 0,
});

export const createNftItemErrorNotificationStep = (params: ContractFeeUsageParams): TransactionFeeCalculationStep => ({
    accountBits: 0,
    accountCells: 0,
    gasUsed: params.nftItem.gas.errorNotification,
    msgBits: 0,
    msgCells: 0,
    timeDelta: 0,
});
