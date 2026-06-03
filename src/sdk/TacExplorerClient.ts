import { gasPriceFetchError } from '../errors';
import { IHttpClient, ITacExplorerClient } from '../interfaces';
import { TacGasPriceResponse } from '../structs/InternalStruct';
import { AxiosHttpClient } from './AxiosHttpClient';
import { DEFAULT_HTTP_CLIENT_TIMEOUT_MS } from './Consts';
import { toCamelCaseTransformer } from './Utils';

export class TacExplorerClient implements ITacExplorerClient {
    private readonly explorerApiEndpoint: string;
    private readonly httpClient: IHttpClient;

    constructor(
        explorerApiEndpoint: string,
        httpClient: IHttpClient = new AxiosHttpClient({ timeout: DEFAULT_HTTP_CLIENT_TIMEOUT_MS }),
    ) {
        this.explorerApiEndpoint = explorerApiEndpoint;
        this.httpClient = httpClient;
    }

    async getTACGasPrice(): Promise<TacGasPriceResponse> {
        try {
            const response = await this.httpClient.get<TacGasPriceResponse>(
                new URL('stats', this.explorerApiEndpoint).toString(),
                { transformResponse: [toCamelCaseTransformer] },
            );
            return response.data;
        } catch (error) {
            throw gasPriceFetchError(`endpoint ${this.explorerApiEndpoint} failed to complete request`, error);
        }
    }
}
