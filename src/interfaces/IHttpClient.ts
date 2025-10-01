import { AxiosRequestConfig, AxiosResponse } from 'axios';

export interface IHttpClient {
    /**
     * Sends an HTTP GET request and returns a typed Axios response.
     * @param url Target URL.
     * @param config Optional Axios request configuration.
     */
    get<T>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;

    /**
     * Sends an HTTP POST request and returns a typed Axios response.
     * @param url Target URL.
     * @param data Request body payload.
     * @param config Optional Axios request configuration.
     */
    post<T>(url: string, data: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
}
