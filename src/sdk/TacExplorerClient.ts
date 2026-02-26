import { gasPriceFetchError } from '../errors/instances';
import { IHttpClient, ITacExplorerClient } from '../interfaces';
import { TacGasPriceResponse } from '../structs/InternalStruct';
import { AxiosHttpClient } from './AxiosHttpClient';
import { toCamelCaseTransformer } from './Utils';

export class TacExplorerClient implements ITacExplorerClient {
    private readonly explorerApiEndpoint: string;
    private readonly httpClient: IHttpClient;

    constructor(explorerApiEndpoint: string, httpClient: IHttpClient = new AxiosHttpClient()) {
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
