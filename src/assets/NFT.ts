import { SandboxContract } from '@ton/sandbox';
import { Address, address, beginCell, Cell, fromNano, OpenedContract } from '@ton/ton';
import { NFTCollection, NFTItem } from '@tonappchain/artifacts/dist/src/ton/wrappers';
import { isAddress as isEthereumAddress } from 'ethers';

import { ContractError, emptyContractError, insufficientBalanceError } from '../errors';
import { NFT_TRANSFER_FORWARD_TON_AMOUNT } from '../sdk/Consts';
import { generateFeeData, generateRandomNumberByTimestamp } from '../sdk/Utils';
import { Validator } from '../sdk/Validator';
import { AssetOpType } from '../structs/InternalStruct';
import { IConfiguration } from '../structs/Services';
import {
    Asset,
    AssetType,
    ContractOpener,
    EVMAddress,
    FeeParams,
    NFTItemData,
    Origin,
    TVMAddress,
} from '../structs/Struct';
export class NFT implements Asset {
    private _addresses: {
        item: TVMAddress;
        collection: TVMAddress;
        index: bigint;
        evmAddress?: EVMAddress;
    };

    readonly origin: Origin;
    readonly type: AssetType = AssetType.NFT;

    private _nftCollection: OpenedContract<NFTCollection> | SandboxContract<NFTCollection>;

    private _configuration: IConfiguration;

    /**
     * @description Create NFT from item address. Item MUST BE deployed on TON.
     * @param configuration - Configuration
     * @param item - Item address (TVM address)
     * @param origin - Origin
     * @returns NFT
     */
    static async fromItem(configuration: IConfiguration, item: TVMAddress): Promise<NFT> {
        Validator.validateTVMAddress(item);

        const nftItem = configuration.TONParams.contractOpener.open(NFTItem.createFromAddress(Address.parse(item)));
        const { collectionAddress, index } = await nftItem.getNFTData();
        const origin = await NFT.getOrigin(configuration, item);

        return new NFT({ item, collection: collectionAddress.toString(), index: BigInt(index) }, origin, configuration);
    }

    /**
     * @description Create NFT from collection address. TON-native assets MUST BE deployed on TON.
     * @param configuration - Configuration
     * @param item - Item address (TVM address)
     * @param origin - Origin
     * @returns NFT
     */
    static async fromCollection(
        configuration: IConfiguration,
        item: { collection: TVMAddress | EVMAddress; index: bigint },
    ): Promise<NFT> {
        const tvmCollectionAddress = isEthereumAddress(item.collection)
            ? await this.getTVMAddress(configuration, item.collection)
            : item.collection;

        const origin = await NFT.getOrigin(configuration, tvmCollectionAddress).catch((e) => {
            if (e instanceof ContractError) {
                return Origin.TAC;
            }
            throw e;
        });

        const nftCollection = configuration.TONParams.contractOpener.open(
            NFTCollection.createFromAddress(Address.parse(tvmCollectionAddress)),
        );

        const itemAddress =
            origin === Origin.TAC
                ? NFTItem.createFromConfig(
                      {
                          collectionAddress: nftCollection.address,
                          cclAddress: Address.parse(configuration.TONParams.crossChainLayerAddress),
                          // @ts-expect-error // bigint can be used, wrapper is not typed properly
                          index: item.index,
                      },
                      configuration.TONParams.nftItemCode,
                  ).address
                : await nftCollection.getNFTAddressByIndex(item.index);

        return new NFT(
            {
                item: itemAddress.toString(),
                collection: tvmCollectionAddress,
                index: item.index,
                evmAddress: isEthereumAddress(item.collection) ? item.collection : undefined,
            },
            origin,
            configuration,
        );
    }

    static async getItemData(contractOpener: ContractOpener, itemAddress: TVMAddress): Promise<NFTItemData> {
        Validator.validateTVMAddress(itemAddress);
        const nftItem = contractOpener.open(NFTItem.createFromAddress(Address.parse(itemAddress)));
        return nftItem.getNFTData();
    }

    static async getCollectionData(contractOpener: ContractOpener, collectionAddress: TVMAddress) {
        Validator.validateTVMAddress(collectionAddress);
        const nftCollection = contractOpener.open(NFTCollection.createFromAddress(Address.parse(collectionAddress)));
        return nftCollection.getCollectionData();
    }

    static async getOrigin(configuration: IConfiguration, itemOrCollection: TVMAddress): Promise<Origin> {
        const { nftItemCode, nftCollectionCode } = configuration.TONParams;

        const { code: givenCodeBOC } = await configuration.TONParams.contractOpener.getContractState(
            Address.parse(itemOrCollection),
        );
        if (!givenCodeBOC) {
            throw emptyContractError;
        }
        const givenNFTCode = Cell.fromBoc(givenCodeBOC)[0];

        if (nftItemCode.equals(givenNFTCode) || nftCollectionCode.equals(givenNFTCode)) {
            return Origin.TAC;
        }

        return Origin.TON;
    }

    static getItemAddress(
        contractOpener: ContractOpener,
        collectionAddress: TVMAddress,
        index: bigint,
    ): Promise<string> {
        Validator.validateTVMAddress(collectionAddress);
        const nftCollection = contractOpener.open(NFTCollection.createFromAddress(Address.parse(collectionAddress)));
        return nftCollection.getNFTAddressByIndex(index).then(toString);
    }

    static async getTVMAddress(
        configuration: IConfiguration,
        collectionAddress: EVMAddress,
        tokenId?: bigint,
    ): Promise<string> {
        Validator.validateEVMAddress(collectionAddress);

        const exists = await configuration.TACParams.tokenUtils['exists(address)'](collectionAddress);

        if (exists) {
            const erc721Token = configuration.artifacts.tac.wrappers.CrossChainLayerERC721FactoryTAC.connect(
                collectionAddress,
                configuration.TACParams.provider,
            );

            const info = await erc721Token.getInfo();
            const nftCollection = configuration.TONParams.contractOpener.open(
                NFTCollection.createFromAddress(address(info.tvmAddress)),
            );

            return tokenId == undefined
                ? nftCollection.address.toString()
                : (await nftCollection.getNFTAddressByIndex(tokenId)).toString();
        } else {
            const nftCollection = configuration.TONParams.contractOpener.open(
                NFTCollection.createFromConfig(
                    {
                        adminAddress: address(configuration.TONParams.crossChainLayerAddress),
                        newAdminAddress: null,
                        collectionContent: beginCell().endCell(),
                        commonContent: beginCell().endCell(),
                        nftItemCode: configuration.TONParams.nftItemCode,
                        originalAddress: collectionAddress,
                    },
                    configuration.TONParams.nftCollectionCode,
                ),
            );

            return tokenId == undefined
                ? nftCollection.address.toString()
                : NFTItem.createFromConfig(
                      {
                          collectionAddress: nftCollection.address,
                          cclAddress: Address.parse(configuration.TONParams.crossChainLayerAddress),
                          // @ts-expect-error // bigint can be used, wrapper is not typed properly
                          index: tokenId,
                      },
                      configuration.TONParams.nftItemCode,
                  ).address.toString();
        }
    }

    constructor(
        nftAddress: {
            item: TVMAddress;
            collection: TVMAddress;
            index: bigint;
            evmAddress?: EVMAddress;
        },
        origin: Origin,
        configuration: IConfiguration,
    ) {
        this._addresses = nftAddress;
        this._configuration = configuration;
        this.origin = origin;

        this._nftCollection = configuration.TONParams.contractOpener.open(
            NFTCollection.createFromAddress(Address.parse(this._addresses.collection)),
        );
    }

    get addresses(): {
        item: string;
        collection: string;
        index: bigint;
        evmAddress?: string;
    } {
        return this._addresses;
    }

    get address(): string {
        return this._addresses.item;
    }

    get rawAmount(): bigint {
        return 1n;
    }

    get clone(): NFT {
        return new NFT(this._addresses, this.origin, this._configuration);
    }

    async withAmount(): Promise<NFT> {
        return this;
    }

    async addAmount(): Promise<NFT> {
        return this;
    }

    async getEVMAddress(): Promise<string> {
        if (this._addresses.evmAddress) {
            return this._addresses.evmAddress;
        }

        const tvmNFTAddress = Address.parse(this._addresses.collection).toString({ bounceable: true });

        const { code: givenNFTCollection } = await this._configuration.TONParams.contractOpener.getContractState(
            Address.parse(tvmNFTAddress),
        );

        if (
            givenNFTCollection &&
            this._configuration.TONParams.nftCollectionCode.equals(Cell.fromBoc(givenNFTCollection)[0])
        ) {
            const nftCollection = this._configuration.TONParams.contractOpener.open(
                NFTCollection.createFromAddress(address(tvmNFTAddress)),
            );
            const evmAddress = await nftCollection.getOriginalAddress();
            this._addresses.evmAddress = evmAddress.toString();
        } else {
            this._addresses.evmAddress =
                await this._configuration.TACParams.tokenUtils.computeAddressERC721(tvmNFTAddress);
        }

        return this._addresses.evmAddress;
    }

    async getTVMAddress(): Promise<string> {
        return this.address.toString();
    }

    async generatePayload(params: {
        excessReceiver: string;
        evmData: Cell;
        crossChainTonAmount?: bigint;
        forwardFeeTonAmount?: bigint;
        feeParams?: FeeParams;
    }): Promise<Cell> {
        const { excessReceiver, evmData, crossChainTonAmount = 0n, forwardFeeTonAmount = 0n, feeParams } = params;

        const opType = this.origin === Origin.TAC ? AssetOpType.NFT_BURN : AssetOpType.NFT_TRANSFER;

        const feeData = generateFeeData(feeParams);

        let payload: Cell;
        switch (opType) {
            case AssetOpType.NFT_BURN:
                payload = this.getBurnPayload(
                    this._configuration.TONParams.crossChainLayerAddress,
                    evmData,
                    crossChainTonAmount,
                    feeData,
                );
                break;
            case AssetOpType.NFT_TRANSFER:
                payload = this.getTransferPayload(
                    this._configuration.TONParams.nftProxyAddress,
                    excessReceiver,
                    forwardFeeTonAmount,
                    evmData,
                    crossChainTonAmount,
                    feeData,
                );
                break;
        }

        return payload;
    }

    async isOwnedBy(userAddress: string): Promise<boolean> {
        const nftData = await NFT.getItemData(this._configuration.TONParams.contractOpener, this.address.toString());
        if (nftData.ownerAddress?.equals(Address.parse(userAddress))) {
            return true;
        }
        return false;
    }

    async checkCanBeTransferedBy(userAddress: string): Promise<void> {
        if (!(await this.isOwnedBy(userAddress))) {
            throw insufficientBalanceError(this.address.toString());
        }
    }

    async getBalanceOf(userAddress: string): Promise<bigint> {
        return (await this.isOwnedBy(userAddress)) ? 1n : 0n;
    }

    private getBurnPayload(
        crossChainLayerAddress: string,
        evmData: Cell,
        crossChainTonAmount: bigint,
        feeData?: Cell,
    ): Cell {
        const queryId = generateRandomNumberByTimestamp().randomNumber;

        return NFTItem.burnMessage(queryId, address(crossChainLayerAddress), crossChainTonAmount, evmData, feeData);
    }

    private getTransferPayload(
        to: string,
        responseAddress: string,
        forwardFeeAmount: bigint,
        evmData: Cell,
        crossChainTonAmount: bigint,
        feeData?: Cell,
    ): Cell {
        const queryId = generateRandomNumberByTimestamp().randomNumber;
        const forwardPayload = beginCell()
            .storeCoins(crossChainTonAmount)
            .storeMaybeRef(feeData)
            .storeMaybeRef(evmData)
            .endCell();

        return NFTItem.transferMessage(
            queryId,
            address(to),
            address(responseAddress),
            Number(fromNano(NFT_TRANSFER_FORWARD_TON_AMOUNT + forwardFeeAmount + crossChainTonAmount)),
            forwardPayload,
        );
    }
}
