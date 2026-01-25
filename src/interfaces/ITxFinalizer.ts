import { TrackTransactionTreeParams } from "../structs/Struct";

export interface ITxFinalizer {
    trackTransactionTree(address: string, hash: string, params?: TrackTransactionTreeParams): Promise<void>;
}
