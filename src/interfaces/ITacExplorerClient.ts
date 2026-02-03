import { TacGasPriceResponse } from '../structs/InternalStruct';

export interface ITacExplorerClient {
    /**
     * Gets TAC gas price from the blockchain explorer.
     * @returns Promise resolving to TAC gas price response with average, fast, and slow prices.
     */
    getTACGasPrice(): Promise<TacGasPriceResponse>;
}
