import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

import { IHttpClient } from '../interfaces';

/**
 * Axios-based HTTP client that isolates SDK traffic from any global axios configuration.
 * It uses its own axios instance, so external/global interceptors and defaults won't affect SDK requests.
 */
export class AxiosHttpClient implements IHttpClient {
    private readonly instance: AxiosInstance;

    constructor(config?: AxiosRequestConfig) {
        this.instance = axios.create(config);
    }

    async get<T>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
        return this.instance.get<T>(url, config);
    }

    async post<T>(url: string, data: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
        return this.instance.post<T>(url, data, config);
    }
}
