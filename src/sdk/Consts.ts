import { toNano } from '@ton/ton';

export const JETTON_TRANSFER_FORWARD_TON_AMOUNT = toNano(0.2);
export const NFT_TRANSFER_FORWARD_TON_AMOUNT = toNano(0.3);

export const MAX_ITERATION_COUNT = 120;

export const DEFAULT_DELAY = 0;

export const SOLIDITY_SIGNATURE_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*(\((bytes,bytes)\))?$/;
export const SOLIDITY_METHOD_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export const MAX_EXT_MSG_SIZE = 65535;
export const MAX_HIGHLOAD_GROUP_MSG_NUM = 254;
export const MAX_MSG_DEPTH = 512;

export const TON_SYMBOL = 'TON';
export const TAC_SYMBOL = 'TAC';

export const FIFTEEN_MINUTES = 15 * 60 * 1000;
export const ONE_YEAR_SECONDS = 365 * 24 * 3600;

export const TON_DECIMALS = 9;
export const TAC_DECIMALS = 18;

export const TON_BURN_ADDRESS = 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c';

// TX TRACKING
export const DEFAULT_FIND_TX_TIMEOUT_MS = 60000;
export const DEFAULT_FIND_TX_RETRY_DELAY_MS = 2000;
export const DEFAULT_FIND_TX_LIMIT = 10;
export const DEFAULT_FIND_TX_ARCHIVAL = true;
export const DEFAULT_FIND_TX_MAX_DEPTH = 10;
export const IGNORE_MSG_VALUE_1_NANO = 1n;

// FEES
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
        gas: {
            internalTransfer: 10669,
            receive: 11427,
            burn: 8653,
        },
    },
    jettonProxy: {
        accountbits: 7760,
        accountCells: 16,
        gas: {
            ownershipAssigned: 8515,
        },
    },
    jettonMinter: {
        accountBits: 10208,
        accountCells: 28,
        gas: {
            burnNotification: 10357,
        },
    },
    nftItem: {
        accountBits: 1422,
        accountCells: 5,
        gas: {
            send: 11722,
            burn: 11552,
        },
    },
    nftProxy: {
        accountBits: 7512,
        accountCells: 15,
        gas: {
            ownershipAssigned: 7688,
        },
    },
};
