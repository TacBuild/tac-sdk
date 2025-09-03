import { mainnet, testnet } from '@tonappchain/artifacts';

import { InternalTACParams, InternalTONParams } from '../structs/InternalStruct';
import { Network } from '../structs/Struct';

export interface IConfiguration {
    readonly network: Network;
    readonly artifacts: typeof testnet | typeof mainnet;
    readonly TONParams: InternalTONParams;
    readonly TACParams: InternalTACParams;
    readonly liteSequencerEndpoints: string[];
    readonly nativeTONAddress: string;
    nativeTACAddress(): Promise<string>;
    readonly getTrustedTACExecutors: string[];
    readonly getTrustedTONExecutors: string[];
    closeConnections(): unknown;
    isContractDeployedOnTVM(address: string): Promise<boolean>;
}
