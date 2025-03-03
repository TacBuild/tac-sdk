import { toNano } from '@ton/ton';

export const TRANSACTION_TON_AMOUNT = toNano(0.35);
export const JETTON_TRANSFER_FORWARD_TON_AMOUNT = toNano(0.2);

export const MAX_ITERATION_COUNT = 120;

export const DEFAULT_DELAY = 0;

export const SOLIDITY_SIGNATURE_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*(\((bytes,bytes)\))?$/;
export const SOLIDITY_METHOD_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
