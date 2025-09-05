import { indexRequiredError, unknownTokenTypeError } from '../errors';
import { IConfiguration, IAsset } from '../interfaces';
import {
    AssetFromFTArg,
    AssetFromNFTCollectionArg,
    AssetFromNFTItemArg,
    AssetType,
    EVMAddress,
    NFTAddressType,
    TVMAddress,
} from '../structs/Struct';
import { AssetCache } from './AssetCache';
import { FT } from './FT';
import { NFT } from './NFT';
import { TON } from './TON';

export class AssetFactory {
    static async from(
        configuration: IConfiguration,
        token: AssetFromFTArg | AssetFromNFTCollectionArg | AssetFromNFTItemArg,
    ): Promise<IAsset> {
        if (token.address === '' || token.address === configuration.nativeTONAddress) {
            if (token.tokenType !== AssetType.FT)
                throw unknownTokenTypeError(token.address, 'detected TON, but token type is not FT');
            return TON.create(configuration);
        }

        const cachedAsset = AssetCache.get(token);
        if (cachedAsset) {
            return cachedAsset.clone.withAmount({ rawAmount: 0n });
        }

        const asset =
            token.tokenType === AssetType.FT
                ? await this.createFTAsset(configuration, token.address)
                : await this.createNFTAsset(
                      configuration,
                      token.address,
                      token.addressType,
                      token.addressType === NFTAddressType.COLLECTION ? token.index : undefined,
                  );

        AssetCache.set(token, asset);
        return asset;
    }

    static async createFTAsset(configuration: IConfiguration, address: TVMAddress | EVMAddress): Promise<IAsset> {
        if (address === configuration.nativeTONAddress || address === '') {
            return TON.create(configuration);
        }

        return FT.fromAddress(configuration, address);
    }

    static async createNFTAsset(
        configuration: IConfiguration,
        address: TVMAddress | EVMAddress,
        addressType: NFTAddressType,
        index?: bigint,
    ): Promise<IAsset> {
        if (addressType === NFTAddressType.ITEM) {
            return NFT.fromItem(configuration, address);
        }

        if (addressType === NFTAddressType.COLLECTION) {
            if (index === undefined) {
                throw indexRequiredError(address);
            }

            return NFT.fromCollection(configuration, { collection: address, index });
        }

        throw unknownTokenTypeError(address, 'NFT address type is unknown: should be either ITEM or COLLECTION');
    }
}
