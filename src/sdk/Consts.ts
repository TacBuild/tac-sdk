import { toNano } from '@ton/ton';

export const TRANSACTION_TON_AMOUNT = toNano(0.55);
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

export const TON_DECIMALS = 9;
export const TAC_DECIMALS = 18;
