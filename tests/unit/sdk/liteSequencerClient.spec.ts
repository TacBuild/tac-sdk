import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AxiosRequestConfig, AxiosResponse } from 'axios';

import { FetchError, IHttpClient, LiteSequencerClient, OperationIdWithLogIndex } from '../../../src';

class MockHttpClient implements IHttpClient {
    readonly getMock = jest.fn<(url: string, config?: AxiosRequestConfig) => Promise<AxiosResponse<unknown>>>();
    readonly postMock = jest.fn<
        (url: string, data: unknown, config?: AxiosRequestConfig) => Promise<AxiosResponse<unknown>>
    >();

    get<T>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
        return this.getMock(url, config) as Promise<AxiosResponse<T>>;
    }

    post<T>(url: string, data: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
        return this.postMock(url, data, config) as Promise<AxiosResponse<T>>;
    }
}

const endpoint = 'https://sequencer.example/';
const ethHash = `0x${'a'.repeat(64)}`;
const tonHash = 'ton-transaction-hash';

function createResponse<T>(data: T): AxiosResponse<T> {
    return { data } as AxiosResponse<T>;
}

describe('LiteSequencerClient', () => {
    let httpClient: MockHttpClient;
    let client: LiteSequencerClient;

    beforeEach(() => {
        httpClient = new MockHttpClient();
        client = new LiteSequencerClient(endpoint, 100, httpClient);
    });

    it('returns operationId from the first entry for ETH array responses', async () => {
        httpClient.getMock.mockResolvedValue(
            createResponse({
                response: [
                    { operationId: 'op-first', logIndex: 12 },
                    { operationId: 'op-second', logIndex: 3 },
                ],
            }),
        );

        const result = await client.getOperationIdByTransactionHash(ethHash);

        expect(result).toBe('op-first');
        expect(httpClient.getMock).toHaveBeenCalledWith('https://sequencer.example/tac/operation-id', {
            params: { transactionHash: ethHash },
        });
    });

    it('returns TAC operation IDs with log indexes for explicit TAC route', async () => {
        const expectedResult: OperationIdWithLogIndex[] = [
            { operationId: 'op-first', logIndex: 12 },
            { operationId: 'op-second', logIndex: 3 },
        ];
        httpClient.getMock.mockResolvedValue(
            createResponse({
                response: expectedResult,
            }),
        );

        const result = await client.getOperationIdByTacTransactionHash(ethHash);

        expect(result).toEqual(expectedResult);
        expect(httpClient.getMock).toHaveBeenCalledWith('https://sequencer.example/tac/operation-id', {
            params: { transactionHash: ethHash },
        });
    });

    it('supports legacy ETH single-object responses', async () => {
        httpClient.getMock.mockResolvedValue(
            createResponse({
                response: { operationId: 'op-legacy', logIndex: 5 },
            }),
        );

        const result = await client.getOperationIdByTransactionHash(ethHash);

        expect(result).toBe('op-legacy');
    });

    it('returns empty string for empty ETH arrays', async () => {
        httpClient.getMock.mockResolvedValue(
            createResponse({
                response: [],
            }),
        );

        const result = await client.getOperationIdByTransactionHash(ethHash);

        expect(result).toBe('');
    });

    it('returns empty string for ETH 404 responses', async () => {
        httpClient.getMock.mockRejectedValue({
            response: {
                status: 404,
            },
        });

        const result = await client.getOperationIdByTransactionHash(ethHash);

        expect(result).toBe('');
    });

    it('uses the TON endpoint for non-EVM transaction hashes', async () => {
        httpClient.getMock.mockResolvedValue(
            createResponse({
                response: 'ton-operation-id',
            }),
        );

        const result = await client.getOperationIdByTransactionHash(tonHash);

        expect(result).toBe('ton-operation-id');
        expect(httpClient.getMock).toHaveBeenCalledWith('https://sequencer.example/ton/operation-id', {
            params: { transactionHash: tonHash },
        });
    });

    it('uses the TON endpoint explicitly for TON hashes in hex format', async () => {
        const tonHexHash = `0x${'b'.repeat(64)}`;

        httpClient.getMock.mockResolvedValue(
            createResponse({
                response: 'ton-operation-id-explicit',
            }),
        );

        const result = await client.getOperationIdByTonTransactionHash(tonHexHash);

        expect(result).toBe('ton-operation-id-explicit');
        expect(httpClient.getMock).toHaveBeenCalledWith('https://sequencer.example/ton/operation-id', {
            params: { transactionHash: tonHexHash },
        });
    });

    it('wraps non-404 ETH errors into FetchError', async () => {
        httpClient.getMock.mockRejectedValue({
            message: 'Request failed',
            response: {
                status: 500,
                data: {
                    message: 'server exploded',
                },
            },
        });

        expect.assertions(4);

        try {
            await client.getOperationIdByTransactionHash(ethHash);
        } catch (error) {
            expect(error).toBeInstanceOf(FetchError);
            expect(error).toMatchObject({
                httpStatus: 500,
                innerMessage: 'server exploded',
            });
            expect(error).toHaveProperty(
                'message',
                expect.stringContaining(
                    'failed to fetch OperationId: request GET https://sequencer.example/tac/operation-id failed to complete request',
                ),
            );
            expect(httpClient.getMock).toHaveBeenCalledTimes(1);
        }
    });
});
