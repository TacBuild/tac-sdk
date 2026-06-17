import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { beginCell } from '@ton/ton';
import { AxiosRequestConfig, AxiosResponse } from 'axios';

import { IHttpClient, ToncenterV3Indexer } from '../../../src';
import { DEFAULT_FIND_TX_LIMIT } from '../../../src/sdk/Consts';

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

function createResponse<T>(data: T): AxiosResponse<T> {
    return { data } as AxiosResponse<T>;
}

function createMessageBodyWithOpcode(opcode: number): string {
    return beginCell().storeUint(opcode, 32).endCell().toBoc().toString('base64');
}

function createValidEventOutBody(): string {
    return beginCell().storeUint(1, 1).endCell().toBoc().toString('base64');
}

describe('ToncenterV3Indexer', () => {
    const endpoint = 'https://toncenter-spb.tac.build/api/v3/';
    const transactionsEndpoint = 'https://toncenter-spb.tac.build/api/v3/transactions';
    const adjacentEndpoint = 'https://toncenter-spb.tac.build/api/v3/adjacentTransactions';
    let httpClient: MockHttpClient;
    let indexer: ToncenterV3Indexer;

    beforeEach(() => {
        httpClient = new MockHttpClient();
        indexer = new ToncenterV3Indexer(endpoint, httpClient);
    });

    it('loads adjacent indexed transactions from adjacentTransactions endpoint', async () => {
        httpClient.getMock.mockResolvedValue(
            createResponse({
                transactions: [
                    {
                        account: '0:CF3A00EE92F2BBFA6DBB94CA323C5CF43C9F1B09CAE6E0352F18DD88949A3A13',
                        hash: 'f+8Z+1Y3tD5fHIZin4HxlVnJBdR+UzO/G0QJ+iaKm1A=',
                        traceId: 'pBrEDmPLmqaD/kcC0vw1ivqJaHfLIVgsyEHbem0FVrI=',
                        outMsgs: [],
                    },
                ],
            }),
        );

        const result = await indexer.getAdjacentTransactions(
            '0xa41ac40e63cb9aa683fe4702d2fc358afa896877cb21582cc841db7a6d0556b2',
        );

        expect(result).toEqual([
            {
                account: '0:CF3A00EE92F2BBFA6DBB94CA323C5CF43C9F1B09CAE6E0352F18DD88949A3A13',
                hash: 'f+8Z+1Y3tD5fHIZin4HxlVnJBdR+UzO/G0QJ+iaKm1A=',
                traceId: 'pBrEDmPLmqaD/kcC0vw1ivqJaHfLIVgsyEHbem0FVrI=',
                outMsgs: [],
            },
        ]);
        expect(httpClient.getMock).toHaveBeenCalledWith(adjacentEndpoint, {
            params: {
                hash: '0xa41ac40e63cb9aa683fe4702d2fc358afa896877cb21582cc841db7a6d0556b2',
            },
            transformResponse: [expect.any(Function)],
        });
    });

    it('loads indexed transaction from transactions endpoint', async () => {
        httpClient.getMock.mockResolvedValue(
            createResponse({
                transactions: [
                    {
                        account: '0:CF3A00EE92F2BBFA6DBB94CA323C5CF43C9F1B09CAE6E0352F18DD88949A3A13',
                        hash: 'f+8Z+1Y3tD5fHIZin4HxlVnJBdR+UzO/G0QJ+iaKm1A=',
                        outMsgs: [],
                    },
                ],
            }),
        );

        const result = await indexer.getTransactionByHash(
            '0xa41ac40e63cb9aa683fe4702d2fc358afa896877cb21582cc841db7a6d0556b2',
        );

        expect(result).toEqual({
            account: '0:CF3A00EE92F2BBFA6DBB94CA323C5CF43C9F1B09CAE6E0352F18DD88949A3A13',
            hash: 'f+8Z+1Y3tD5fHIZin4HxlVnJBdR+UzO/G0QJ+iaKm1A=',
            outMsgs: [],
        });
        expect(httpClient.getMock).toHaveBeenCalledWith(transactionsEndpoint, {
            params: {
                hash: '0xa41ac40e63cb9aa683fe4702d2fc358afa896877cb21582cc841db7a6d0556b2',
                limit: DEFAULT_FIND_TX_LIMIT,
            },
            transformResponse: [expect.any(Function)],
        });
    });

    it('loads indexed transactions from transactionsByMessage endpoint', async () => {
        httpClient.getMock.mockResolvedValue(
            createResponse({
                transactions: [
                    {
                        account: '0:CF3A00EE92F2BBFA6DBB94CA323C5CF43C9F1B09CAE6E0352F18DD88949A3A13',
                        hash: 'f+8Z+1Y3tD5fHIZin4HxlVnJBdR+UzO/G0QJ+iaKm1A=',
                        outMsgs: [],
                    },
                ],
            }),
        );

        const result = await indexer.getTransactionsByMessageHash(
            '2jgA4GAQZXcA7ZlrdQ7IA+EhY8KHg8ccLRqKpzA/T2A=',
            'in',
        );

        expect(result).toEqual([
            {
                account: '0:CF3A00EE92F2BBFA6DBB94CA323C5CF43C9F1B09CAE6E0352F18DD88949A3A13',
                hash: 'f+8Z+1Y3tD5fHIZin4HxlVnJBdR+UzO/G0QJ+iaKm1A=',
                outMsgs: [],
            },
        ]);
        expect(httpClient.getMock).toHaveBeenCalledWith('https://toncenter-spb.tac.build/api/v3/transactionsByMessage', {
            params: {
                msg_hash: '2jgA4GAQZXcA7ZlrdQ7IA+EhY8KHg8ccLRqKpzA/T2A=',
                direction: 'in',
                limit: DEFAULT_FIND_TX_LIMIT,
            },
            transformResponse: [expect.any(Function)],
        });
    });

    it('finds target account transaction in child direction', async () => {
        httpClient.getMock
            .mockResolvedValueOnce(
                createResponse({
                    transactions: [
                        {
                            account: '0:AB37073178ED026429247F1D4EF9272A08DF3EAEEAC1F1C93132B533DD92A2D4',
                            hash: 'pBrEDmPLmqaD/kcC0vw1ivqJaHfLIVgsyEHbem0FVrI=',
                            outMsgs: [],
                        },
                    ],
                }),
            )
            .mockResolvedValueOnce(
                createResponse({
                    transactions: [
                        {
                            account: '0:C8BA7D20AB6D96F4DD7F9574C9C4ED11A6DAC7EB6E48BAD58373052124978EB3',
                            hash: 'f+8Z+1Y3tD5fHIZin4HxlVnJBdR+UzO/G0QJ+iaKm1A=',
                            traceId: 'pBrEDmPLmqaD/kcC0vw1ivqJaHfLIVgsyEHbem0FVrI=',
                            inMsg: {
                                messageContent: {
                                    body: createMessageBodyWithOpcode(0x497dae1d),
                                },
                            },
                            outMsgs: [
                                {
                                    destination: null,
                                    messageContent: {
                                        body: createValidEventOutBody(),
                                    },
                                },
                            ],
                        },
                    ],
                }),
            );

        const result = await indexer.findCollectibleCrossChainLayerTransaction(
            '0xa41ac40e63cb9aa683fe4702d2fc358afa896877cb21582cc841db7a6d0556b2',
            '0:C8BA7D20AB6D96F4DD7F9574C9C4ED11A6DAC7EB6E48BAD58373052124978EB3',
        );

        expect(result).toEqual({
            account: '0:C8BA7D20AB6D96F4DD7F9574C9C4ED11A6DAC7EB6E48BAD58373052124978EB3',
            hash: 'f+8Z+1Y3tD5fHIZin4HxlVnJBdR+UzO/G0QJ+iaKm1A=',
            traceId: 'pBrEDmPLmqaD/kcC0vw1ivqJaHfLIVgsyEHbem0FVrI=',
            inMsg: {
                messageContent: {
                    body: createMessageBodyWithOpcode(0x497dae1d),
                },
            },
            outMsgs: [
                {
                    destination: null,
                    messageContent: {
                        body: createValidEventOutBody(),
                    },
                },
            ],
        });
    });

    it('finds target account transaction in parent direction when started from child hash', async () => {
        httpClient.getMock
            .mockResolvedValueOnce(
                createResponse({
                    transactions: [
                        {
                            account: '0:CF3A00EE92F2BBFA6DBB94CA323C5CF43C9F1B09CAE6E0352F18DD88949A3A13',
                            hash: 'f+8Z+1Y3tD5fHIZin4HxlVnJBdR+UzO/G0QJ+iaKm1A=',
                            outMsgs: [],
                        },
                    ],
                }),
            )
            .mockResolvedValueOnce(
                createResponse({
                    transactions: [
                        {
                            account: '0:AB37073178ED026429247F1D4EF9272A08DF3EAEEAC1F1C93132B533DD92A2D4',
                            hash: 'pBrEDmPLmqaD/kcC0vw1ivqJaHfLIVgsyEHbem0FVrI=',
                            traceId: 'pBrEDmPLmqaD/kcC0vw1ivqJaHfLIVgsyEHbem0FVrI=',
                            inMsg: {
                                messageContent: {
                                    body: createMessageBodyWithOpcode(0x6c582059),
                                },
                            },
                            outMsgs: [
                                {
                                    destination: null,
                                    messageContent: {
                                        body: createValidEventOutBody(),
                                    },
                                },
                            ],
                        },
                    ],
                }),
            );

        const result = await indexer.findCollectibleCrossChainLayerTransaction(
            'f+8Z+1Y3tD5fHIZin4HxlVnJBdR+UzO/G0QJ+iaKm1A=',
            '0:AB37073178ED026429247F1D4EF9272A08DF3EAEEAC1F1C93132B533DD92A2D4',
        );

        expect(result).toEqual({
            account: '0:AB37073178ED026429247F1D4EF9272A08DF3EAEEAC1F1C93132B533DD92A2D4',
            hash: 'pBrEDmPLmqaD/kcC0vw1ivqJaHfLIVgsyEHbem0FVrI=',
            traceId: 'pBrEDmPLmqaD/kcC0vw1ivqJaHfLIVgsyEHbem0FVrI=',
            inMsg: {
                messageContent: {
                    body: createMessageBodyWithOpcode(0x6c582059),
                },
            },
            outMsgs: [
                {
                    destination: null,
                    messageContent: {
                        body: createValidEventOutBody(),
                    },
                },
            ],
        });
    });

    it('skips a transaction on the target account when it is not a sequencer-collected event', async () => {
        httpClient.getMock
            .mockResolvedValueOnce(
                createResponse({
                    transactions: [
                        {
                            account: '0:C8BA7D20AB6D96F4DD7F9574C9C4ED11A6DAC7EB6E48BAD58373052124978EB3',
                            hash: 'pBrEDmPLmqaD/kcC0vw1ivqJaHfLIVgsyEHbem0FVrI=',
                            outMsgs: [],
                        },
                    ],
                }),
            )
            .mockResolvedValueOnce(
                createResponse({
                    transactions: [
                        {
                            account: '0:C8BA7D20AB6D96F4DD7F9574C9C4ED11A6DAC7EB6E48BAD58373052124978EB3',
                            hash: '+ux6QOo4uZtXAUcvXQDoTKZjPDiz6+4oJv9pODRAY1I=',
                            inMsg: {
                                messageContent: {
                                    body: createMessageBodyWithOpcode(0x497dae1d),
                                },
                            },
                            outMsgs: [
                                {
                                    destination: null,
                                    messageContent: {
                                        body: createValidEventOutBody(),
                                    },
                                },
                            ],
                        },
                    ],
                }),
            );

        const result = await indexer.findCollectibleCrossChainLayerTransaction(
            '0xa41ac40e63cb9aa683fe4702d2fc358afa896877cb21582cc841db7a6d0556b2',
            '0:C8BA7D20AB6D96F4DD7F9574C9C4ED11A6DAC7EB6E48BAD58373052124978EB3',
        );

        expect(result).toEqual({
            account: '0:C8BA7D20AB6D96F4DD7F9574C9C4ED11A6DAC7EB6E48BAD58373052124978EB3',
            hash: '+ux6QOo4uZtXAUcvXQDoTKZjPDiz6+4oJv9pODRAY1I=',
            inMsg: {
                messageContent: {
                    body: createMessageBodyWithOpcode(0x497dae1d),
                },
            },
            outMsgs: [
                {
                    destination: null,
                    messageContent: {
                        body: createValidEventOutBody(),
                    },
                },
            ],
        });
    });

    it('applies traversal limits from params instead of hardcoded defaults', async () => {
        httpClient.getMock
            .mockResolvedValueOnce(
                createResponse({
                    transactions: [
                        {
                            account: '0:AB37073178ED026429247F1D4EF9272A08DF3EAEEAC1F1C93132B533DD92A2D4',
                            hash: 'pBrEDmPLmqaD/kcC0vw1ivqJaHfLIVgsyEHbem0FVrI=',
                            outMsgs: [],
                        },
                    ],
                }),
            )
            .mockResolvedValueOnce(
                createResponse({
                    transactions: [
                        {
                            account: '0:CF3A00EE92F2BBFA6DBB94CA323C5CF43C9F1B09CAE6E0352F18DD88949A3A13',
                            hash: 'f+8Z+1Y3tD5fHIZin4HxlVnJBdR+UzO/G0QJ+iaKm1A=',
                            outMsgs: [],
                        },
                    ],
                }),
            );

        const result = await indexer.findCollectibleCrossChainLayerTransaction(
            '0xa41ac40e63cb9aa683fe4702d2fc358afa896877cb21582cc841db7a6d0556b2',
            '0:C8BA7D20AB6D96F4DD7F9574C9C4ED11A6DAC7EB6E48BAD58373052124978EB3',
            { maxDepth: 1, maxScannedTransactions: 1 },
        );

        expect(result).toBeNull();
        expect(httpClient.getMock).toHaveBeenCalledTimes(2);
    });
});
