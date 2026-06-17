import axios from 'axios';

import { LiteSequencerClient, TacExplorerClient, TonTxFinalizer } from '../../../src';
import { ToncenterV3Indexer } from '../../../src/adapters';
import { DEFAULT_HTTP_CLIENT_TIMEOUT_MS } from '../../../src/sdk/Consts';

jest.mock('axios', () => {
    const actual = jest.requireActual('axios');
    return {
        ...actual,
        create: jest.fn(),
    };
});

describe('default HTTP timeout', () => {
    const mockedAxios = axios as jest.Mocked<typeof axios>;

    beforeEach(() => {
        mockedAxios.create.mockReturnValue({
            get: jest.fn(),
            post: jest.fn(),
        } as unknown as ReturnType<typeof axios.create>);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it.each([
        ['LiteSequencerClient', () => new LiteSequencerClient('https://sequencer.example/')],
        ['ToncenterV3Indexer', () => new ToncenterV3Indexer('https://toncenter.example/api/v3/')],
        ['TacExplorerClient', () => new TacExplorerClient('https://explorer.example/')],
        ['TonTxFinalizer', () => new TonTxFinalizer({ urlBuilder: (hash: string) => `https://ton.example/${hash}` })],
    ])('%s creates its default HTTP client with the SDK timeout', (_name, createClient) => {
        createClient();

        expect(mockedAxios.create).toHaveBeenCalledTimes(1);
        expect(mockedAxios.create).toHaveBeenCalledWith({
            timeout: DEFAULT_HTTP_CLIENT_TIMEOUT_MS,
        });
    });
});
