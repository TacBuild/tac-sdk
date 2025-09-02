import { Address } from '@ton/ton';
import { isAddress as isEthereumAddress } from 'ethers';

import { evmAddressError, tvmAddressError } from '../errors/instances';
import { EvmProxyMsg, TACSimulationRequest } from '../structs/Struct';

export class Validator {
    static validateTACSimulationRequest(req: TACSimulationRequest): void {
        this.validateEVMAddress(req.tacCallParams.target);
        req.evmValidExecutors.forEach(this.validateEVMAddress);
        req.tvmValidExecutors.forEach(this.validateTVMAddress);
        req.tonAssets.forEach((asset) => {
            // if empty then it's native TON
            if (asset.tokenAddress !== '') {
                this.validateTVMAddress(asset.tokenAddress);
            }
        });
        this.validateTVMAddress(req.tonCaller);
    }

    static validateEVMProxyMsg(evmProxyMsg: EvmProxyMsg): void {
        this.validateEVMAddress(evmProxyMsg.evmTargetAddress);
    }

    static validateTVMAddresses(addresses?: string[]): void {
        addresses?.forEach(this.validateTVMAddress);
    }

    static validateEVMAddresses(addresses?: string[]): void {
        addresses?.forEach(this.validateEVMAddress);
    }

    static validateTVMAddress(address: string): void {
        try {
            Address.parse(address); // will throw on error address
        } catch {
            throw tvmAddressError(address);
        }
    }

    static validateEVMAddress(address: string): void {
        if (!address.startsWith('0x') || !isEthereumAddress(address)) {
            throw evmAddressError(address);
        }
    }
}
