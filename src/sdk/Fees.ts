import { TransactionFeeCalculationStep } from '../structs/InternalStruct';
import { ONE_YEAR_SECONDS } from './Consts';

export const FIXED_POINT_SHIFT = 2 ** 16;

export const CONTRACT_FEE_USAGE_PARAMS = {
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
        accountbits: 7760,
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
    msgBits: number,
    msgCells: number,
): TransactionFeeCalculationStep => ({
    accountBits: CONTRACT_FEE_USAGE_PARAMS.crossChainLayer.accountBits,
    accountCells: CONTRACT_FEE_USAGE_PARAMS.crossChainLayer.accountCells,
    gasUsed: CONTRACT_FEE_USAGE_PARAMS.crossChainLayer.gas.tvmMsgToEvm,
    msgBits,
    msgCells,
    timeDelta: ONE_YEAR_SECONDS,
});

export const createJettonWalletInternalTransferStep = (
    msgBits: number,
    msgCells: number,
): TransactionFeeCalculationStep => ({
    accountBits: CONTRACT_FEE_USAGE_PARAMS.jettonWallet.accountBits,
    accountCells: CONTRACT_FEE_USAGE_PARAMS.jettonWallet.accountCells,
    gasUsed: CONTRACT_FEE_USAGE_PARAMS.jettonWallet.gas.internalTransfer,
    msgBits,
    msgCells,
    timeDelta: ONE_YEAR_SECONDS,
});

export const createJettonWalletReceiveStep = (msgBits: number, msgCells: number): TransactionFeeCalculationStep => ({
    accountBits: CONTRACT_FEE_USAGE_PARAMS.jettonWallet.accountBits,
    accountCells: CONTRACT_FEE_USAGE_PARAMS.jettonWallet.accountCells,
    gasUsed: CONTRACT_FEE_USAGE_PARAMS.jettonWallet.gas.receive,
    msgBits,
    msgCells,
    timeDelta: ONE_YEAR_SECONDS,
});

export const createJettonWalletBurnStep = (msgBits: number, msgCells: number): TransactionFeeCalculationStep => ({
    accountBits: CONTRACT_FEE_USAGE_PARAMS.jettonWallet.accountBits,
    accountCells: CONTRACT_FEE_USAGE_PARAMS.jettonWallet.accountCells,
    gasUsed: CONTRACT_FEE_USAGE_PARAMS.jettonWallet.gas.burn,
    msgBits,
    msgCells,
    timeDelta: ONE_YEAR_SECONDS,
});

export const createJettonProxyOwnershipAssignedStep = (
    msgBits: number,
    msgCells: number,
): TransactionFeeCalculationStep => ({
    accountBits: CONTRACT_FEE_USAGE_PARAMS.jettonProxy.accountbits,
    accountCells: CONTRACT_FEE_USAGE_PARAMS.jettonProxy.accountCells,
    gasUsed: CONTRACT_FEE_USAGE_PARAMS.jettonProxy.gas.ownershipAssigned,
    msgBits,
    msgCells,
    timeDelta: ONE_YEAR_SECONDS,
});

export const createJettonMinterBurnNotificationStep = (
    msgBits: number,
    msgCells: number,
): TransactionFeeCalculationStep => ({
    accountBits: CONTRACT_FEE_USAGE_PARAMS.jettonMinter.accountBits,
    accountCells: CONTRACT_FEE_USAGE_PARAMS.jettonMinter.accountCells,
    gasUsed: CONTRACT_FEE_USAGE_PARAMS.jettonMinter.gas.burnNotification,
    msgBits,
    msgCells,
    timeDelta: ONE_YEAR_SECONDS,
});

export const createNftItemSendStep = (msgBits: number, msgCells: number): TransactionFeeCalculationStep => ({
    accountBits: CONTRACT_FEE_USAGE_PARAMS.nftItem.accountBits,
    accountCells: CONTRACT_FEE_USAGE_PARAMS.nftItem.accountCells,
    gasUsed: CONTRACT_FEE_USAGE_PARAMS.nftItem.gas.send,
    msgBits,
    msgCells,
    timeDelta: ONE_YEAR_SECONDS,
});

export const createNftItemBurnStep = (msgBits: number, msgCells: number): TransactionFeeCalculationStep => ({
    accountBits: CONTRACT_FEE_USAGE_PARAMS.nftItem.accountBits,
    accountCells: CONTRACT_FEE_USAGE_PARAMS.nftItem.accountCells,
    gasUsed: CONTRACT_FEE_USAGE_PARAMS.nftItem.gas.burn,
    msgBits,
    msgCells,
    timeDelta: ONE_YEAR_SECONDS,
});

export const createNftProxyOwnershipAssignedStep = (
    msgBits: number,
    msgCells: number,
): TransactionFeeCalculationStep => ({
    accountBits: CONTRACT_FEE_USAGE_PARAMS.nftProxy.accountBits,
    accountCells: CONTRACT_FEE_USAGE_PARAMS.nftProxy.accountCells,
    gasUsed: CONTRACT_FEE_USAGE_PARAMS.nftProxy.gas.ownershipAssigned,
    msgBits,
    msgCells,
    timeDelta: ONE_YEAR_SECONDS,
});

export const createErrorNotificationGasStep = (msgBits: number, msgCells: number): TransactionFeeCalculationStep => ({
    accountBits: 0,
    accountCells: 0,
    gasUsed: CONTRACT_FEE_USAGE_PARAMS.jettonProxy.gas.errorNotification,
    msgBits,
    msgCells,
    timeDelta: 0,
});

export const createEstimatedSendTransferGasStep = (
    msgBits: number,
    msgCells: number,
): TransactionFeeCalculationStep => ({
    accountBits: 0,
    accountCells: 0,
    gasUsed: CONTRACT_FEE_USAGE_PARAMS.jettonWallet.gas.estimatedSendTransfer,
    msgBits,
    msgCells,
    timeDelta: 0,
});

export const createEstimatedReceiveTransferGasStep = (
    msgBits: number,
    msgCells: number,
): TransactionFeeCalculationStep => ({
    accountBits: 0,
    accountCells: 0,
    gasUsed: CONTRACT_FEE_USAGE_PARAMS.jettonWallet.gas.estimatedReceiveTransfer,
    msgBits,
    msgCells,
    timeDelta: 0,
});

export const createMintAfterErrorGasStep = (msgBits: number, msgCells: number): TransactionFeeCalculationStep => ({
    accountBits: CONTRACT_FEE_USAGE_PARAMS.jettonMinter.accountBits,
    accountCells: CONTRACT_FEE_USAGE_PARAMS.jettonMinter.accountCells,
    gasUsed: CONTRACT_FEE_USAGE_PARAMS.jettonMinter.gas.mintAfterError,
    msgBits,
    msgCells,
    timeDelta: ONE_YEAR_SECONDS,
});

export const createNftProxyErrorNotificationStep = (
    msgBits: number,
    msgCells: number,
): TransactionFeeCalculationStep => ({
    accountBits: 0,
    accountCells: 0,
    gasUsed: CONTRACT_FEE_USAGE_PARAMS.nftProxy.gas.errorNotification,
    msgBits,
    msgCells,
    timeDelta: 0,
});
export const createNftItemErrorNotificationStep = (): TransactionFeeCalculationStep => ({
    accountBits: 0,
    accountCells: 0,
    gasUsed: CONTRACT_FEE_USAGE_PARAMS.nftItem.gas.errorNotification,
    msgBits: 0,
    msgCells: 0,
    timeDelta: 0,
});
