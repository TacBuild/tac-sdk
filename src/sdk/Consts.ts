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

export const FIVE_MINUTES = 5 * 60 * 1000;
export const MINUTE = 60 * 1000;

export const TON_BURN_ADDRESS = 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c';

export const DEFAULT_HTTP_CLIENT_TIMEOUT_MS = 30000;
export const DEFAULT_RETRY_MAX_COUNT = 5;
export const DEFAULT_RETRY_DELAY_MS = 1000;
export const DEFAULT_FIND_TX_LIMIT = 100;
export const DEFAULT_MAX_SCANNED_TRANSACTIONS = 100;
export const DEFAULT_FIND_TX_ARCHIVAL = true;
export const DEFAULT_FIND_TX_MAX_DEPTH = 10;
export const DEFAULT_WAIT_FOR_ROOT_TRANSACTION = true;
export const DEFAULT_WAIT_FOR_ROOT_TRANSACTION_TIMEOUT_MS = MINUTE;
export const DEFAULT_WAIT_FOR_ROOT_TRANSACTION_RETRY_DELAY_MS = 1000;
export const IGNORE_MSG_VALUE_1_NANO = 1n;
export const IGNORE_OPCODE = [
    0xd53276db, // Excess
];
