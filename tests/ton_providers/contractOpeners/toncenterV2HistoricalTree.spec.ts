import { TonClient } from '@ton/ton';

import { AxiosHttpClient, TonClientOpener } from '../../../src';

type ToncenterV3Transaction = {
    account: string;
    hash: string;
    lt: string;
    now: number;
    out_msgs?: unknown[];
    description?: {
        aborted?: boolean;
        compute_ph?: {
            success?: boolean;
        };
        action?: {
            success?: boolean;
        };
    };
};

type ToncenterV3TransactionsResponse = {
    transactions: ToncenterV3Transaction[];
};

type HttpErrorLike = {
    message?: string;
    response?: {
        status?: number;
        data?: unknown;
    };
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LOOKBACK_DAYS = 1;
const DEFAULT_DATE_WINDOW_DAYS = 1;
const DEFAULT_TEST_TIMEOUT_MS = 120000;
const DEFAULT_TONCENTER_V2_ENDPOINT = 'https://toncenter-spb.tac.build/api/v2/jsonRPC';
const DEFAULT_TONCENTER_V3_ENDPOINT = 'https://toncenter-spb.tac.build/api/v3/';
const DEFAULT_ACCOUNT = 'EQAVGclLM4b0fb4pYRbS-OUUJiXlaTk8C0D1IueAzx6XgGo0';

function numberFromEnv(name: string, fallback: number): number {
    const value = process.env[name];
    if (!value) return fallback;

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        throw new Error(`${name} must be a finite number`);
    }
    return parsed;
}

function optionalBooleanFromEnv(name: string): boolean | undefined {
    const value = process.env[name];
    if (value === undefined) return undefined;

    if (value === '1' || value.toLowerCase() === 'true') return true;
    if (value === '0' || value.toLowerCase() === 'false') return false;

    throw new Error(`${name} must be true, false, 1 or 0`);
}

function getTargetDate(): Date {
    const configuredDate = process.env.TONCENTER_V2_TREE_TARGET_DATE;
    if (configuredDate) {
        const date = new Date(configuredDate);
        if (Number.isNaN(date.getTime())) {
            throw new Error('TONCENTER_V2_TREE_TARGET_DATE must be a valid date');
        }

        return date;
    }

    const lookbackMs = process.env.TONCENTER_V2_TREE_LOOKBACK_WEEKS
        ? numberFromEnv('TONCENTER_V2_TREE_LOOKBACK_WEEKS', 0) * 7 * DAY_MS
        : numberFromEnv('TONCENTER_V2_TREE_LOOKBACK_DAYS', DEFAULT_LOOKBACK_DAYS) * DAY_MS;

    const date = new Date(Date.now() - lookbackMs);
    if (Number.isNaN(date.getTime())) {
        throw new Error('Configured TONCENTER_V2_TREE lookback must produce a valid date');
    }

    return date;
}

function isSuccessfulTransaction(transaction: ToncenterV3Transaction): boolean {
    return (
        transaction.description?.aborted === false &&
        transaction.description.compute_ph?.success !== false &&
        transaction.description.action?.success !== false
    );
}

function summarizeError(error: unknown): string {
    const httpError = error as HttpErrorLike;
    const parts = [error instanceof Error ? error.message : String(error)];

    if (httpError.response?.status !== undefined) {
        parts.push(`status=${httpError.response.status}`);
    }
    if (httpError.response?.data !== undefined) {
        parts.push(`data=${JSON.stringify(httpError.response.data)}`);
    }

    return parts.join(' ');
}

async function selectHistoricalTransaction(): Promise<ToncenterV3Transaction> {
    const targetDate = getTargetDate();
    const windowDays = numberFromEnv('TONCENTER_V2_TREE_DATE_WINDOW_DAYS', DEFAULT_DATE_WINDOW_DAYS);
    const startUtime = Math.floor((targetDate.getTime() - windowDays * DAY_MS) / 1000);
    const endUtime = Math.floor((targetDate.getTime() + windowDays * DAY_MS) / 1000);
    const account = process.env.TONCENTER_V2_TREE_ACCOUNT ?? DEFAULT_ACCOUNT;
    const endpoint = process.env.TONCENTER_V2_TREE_V3_ENDPOINT ?? DEFAULT_TONCENTER_V3_ENDPOINT;
    const url = new URL('transactions', endpoint);

    url.searchParams.set('account', account);
    url.searchParams.set('start_utime', startUtime.toString());
    url.searchParams.set('end_utime', endUtime.toString());
    url.searchParams.set('limit', numberFromEnv('TONCENTER_V2_TREE_SELECTION_LIMIT', 20).toString());
    url.searchParams.set('sort', 'asc');

    const httpClient = new AxiosHttpClient({ timeout: numberFromEnv('TONCENTER_V2_TREE_HTTP_TIMEOUT_MS', 60000) });
    const response = await httpClient.get<ToncenterV3TransactionsResponse>(url.toString());
    const transaction =
        response.data.transactions.find(
            (candidate) => isSuccessfulTransaction(candidate) && (candidate.out_msgs?.length ?? 0) > 0,
        ) ??
        response.data.transactions.find(isSuccessfulTransaction) ??
        response.data.transactions[0];

    if (!transaction) {
        throw new Error(
            `No TON transaction found for account=${account} around ${targetDate.toISOString()} windowDays=${windowDays}`,
        );
    }

    return transaction;
}

describe('Toncenter v2 configurable transaction tree', () => {
    it(
        'tracks a transaction tree selected by configurable historical date',
        async () => {
            const account = process.env.TONCENTER_V2_TREE_ACCOUNT ?? DEFAULT_ACCOUNT;
            const v2Endpoint = process.env.TONCENTER_V2_TREE_V2_ENDPOINT ?? DEFAULT_TONCENTER_V2_ENDPOINT;
            const transaction = await selectHistoricalTransaction();
            const opener = new TonClientOpener(
                new TonClient({
                    endpoint: v2Endpoint,
                    timeout: numberFromEnv('TONCENTER_V2_TREE_HTTP_TIMEOUT_MS', 60000),
                }),
            );
            const archival = optionalBooleanFromEnv('TONCENTER_V2_TREE_ARCHIVAL');
            const params = {
                maxDepth: numberFromEnv('TONCENTER_V2_TREE_MAX_DEPTH', 2),
                limit: numberFromEnv('TONCENTER_V2_TREE_PAGE_LIMIT', 10),
                maxScannedTransactions: numberFromEnv('TONCENTER_V2_TREE_MAX_SCANNED_TRANSACTIONS', 500),
                rootLt: transaction.lt,
                retryOnNotFound: true,
                retries: numberFromEnv('TONCENTER_V2_TREE_NOT_FOUND_RETRIES', 1),
                retryDelayMs: numberFromEnv('TONCENTER_V2_TREE_NOT_FOUND_RETRY_DELAY_MS', 500),
            };
            if (archival !== undefined) {
                Object.assign(params, { archival });
            }

            try {
                const result = await opener.trackTransactionTreeWithResult(account, transaction.hash, params);

                if (!result.success) {
                    throw new Error(
                        `Toncenter v2 returned unsuccessful tree result for hash=${transaction.hash} lt=${transaction.lt} now=${new Date(transaction.now * 1000).toISOString()} error=${JSON.stringify(result.error)}`,
                    );
                }

                expect(result.checkedCount).toBeGreaterThan(0);
            } catch (error) {
                throw new Error(
                    `Toncenter v2 failed to track transaction tree endpoint=${v2Endpoint} account=${account} hash=${transaction.hash} lt=${transaction.lt} now=${new Date(transaction.now * 1000).toISOString()} archival=${archival ?? 'omitted'} ${summarizeError(error)}`,
                );
            }
        },
        numberFromEnv('TONCENTER_V2_TREE_TEST_TIMEOUT_MS', DEFAULT_TEST_TIMEOUT_MS),
    );
});
