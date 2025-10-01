import axios from 'axios';

import { AxiosHttpClient } from '../../../src';

jest.mock('axios', () => {
    const actual = jest.requireActual('axios');
    return {
        ...actual,
        create: jest.fn(),
    };
});

describe('AxiosHttpClient', () => {
    const getMock = jest.fn();
    const postMock = jest.fn();
    const mockedAxios = axios as jest.Mocked<typeof axios>;

    beforeEach(() => {
        mockedAxios.create.mockReturnValue({
            get: getMock,
            post: postMock,
        } as unknown as ReturnType<typeof axios.create>);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('creates isolated axios instance with provided config', () => {
        const config = { baseURL: 'https://example.org', timeout: 5000 };
        new AxiosHttpClient(config);
        expect(mockedAxios.create).toHaveBeenCalledTimes(1);
        expect(mockedAxios.create).toHaveBeenCalledWith(config);
    });

    it('delegates get requests to the isolated instance', async () => {
        const response = { data: { ok: true } };
        getMock.mockResolvedValue(response);
        const client = new AxiosHttpClient();

        const result = await client.get('/health', { timeout: 1000 });

        expect(getMock).toHaveBeenCalledTimes(1);
        expect(getMock).toHaveBeenCalledWith('/health', { timeout: 1000 });
        expect(result).toBe(response);
    });

    it('delegates post requests to the isolated instance', async () => {
        const response = { data: { ok: true } };
        postMock.mockResolvedValue(response);
        const client = new AxiosHttpClient();

        const result = await client.post('/process', { input: 1 }, { timeout: 2000 });

        expect(postMock).toHaveBeenCalledTimes(1);
        expect(postMock).toHaveBeenCalledWith('/process', { input: 1 }, { timeout: 2000 });
        expect(result).toBe(response);
    });
});
