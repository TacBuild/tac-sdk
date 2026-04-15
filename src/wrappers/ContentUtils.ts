import { Sha256 } from '@aws-crypto/sha256-js';
import { beginCell, Builder, Cell, Dictionary, Slice } from '@ton/ton';
import axios from 'axios';

import { notMultiplyOf8Error, prefixError, unsupportedFormatError, unsupportedKeyError } from '../errors';
import { MetadataPersistenceType, OffchainMetadataResult, ReadMetadataResult } from '../structs/InternalStruct';

export const ONCHAIN_CONTENT_PREFIX = 0x00;
export const OFFCHAIN_CONTENT_PREFIX = 0x01;

const SNAKE_CONTENT_PREFIX = 0x00;
const CHUNKED_CONTENT_PREFIX = 0x01;
const CELL_MAX_BITS = 1023;

type MetadataEncoding = 'utf8' | 'ascii';

export type JsonMetadataValue =
    | string
    | number
    | boolean
    | null
    | JsonMetadataValue[]
    | { [key: string]: JsonMetadataValue };

export type MetadataRecord<TKey extends string = string> = Partial<Record<TKey, JsonMetadataValue>> & {
    [key: string]: JsonMetadataValue | undefined;
};

export type CommonMetadataKeys = 'uri' | 'name' | 'description' | 'image' | 'image_data';

export type JettonMetaDataKeys = CommonMetadataKeys | 'symbol' | 'decimals' | 'amount_style' | 'render_type';

export type NFTMetadataKeys = CommonMetadataKeys;

export interface JettonMetadata extends MetadataRecord<JettonMetaDataKeys> {
    uri?: string;
    name?: string;
    description?: string;
    image?: string;
    image_data?: string;
    symbol?: string;
    decimals?: string | number;
    amount_style?: string;
    render_type?: string;
}

export interface NFTMetadata extends MetadataRecord<NFTMetadataKeys> {
    uri?: string;
    name?: string;
    description?: string;
    image?: string;
    image_data?: string;
}

type ExtendedMetadata<TKey extends string> = {
    persistenceType: MetadataPersistenceType;
    metadata: MetadataRecord<TKey> | null;
    contentUri?: string;
};

export type JettonExtendedMetadata = ExtendedMetadata<JettonMetaDataKeys> & {
    isJettonDeployerFaultyOnChainData?: boolean;
};

export type NFTExtendedMetadata = ExtendedMetadata<NFTMetadataKeys>;

type MetadataSpec<TKey extends string> = Record<TKey, MetadataEncoding | undefined>;

const commonMetadataSpec: Record<CommonMetadataKeys, MetadataEncoding> = {
    uri: 'ascii',
    name: 'utf8',
    description: 'utf8',
    image: 'ascii',
    image_data: 'ascii',
};

const jettonOnChainMetadataSpec: MetadataSpec<JettonMetaDataKeys> = {
    ...commonMetadataSpec,
    symbol: 'utf8',
    decimals: 'utf8',
    amount_style: 'utf8',
    render_type: 'utf8',
};

const nftOnChainMetadataSpec: MetadataSpec<NFTMetadataKeys> = {
    ...commonMetadataSpec,
};

const sha256 = (value: string) => {
    const sha = new Sha256();
    sha.update(value);
    return Buffer.from(sha.digestSync());
};

function getAvailableBytes(withPrefix: boolean) {
    return Math.floor((CELL_MAX_BITS - (withPrefix ? 8 : 0)) / 8);
}

function buildSnakeCell(content: Buffer, withPrefix: boolean): Cell {
    const cell = new Builder();
    if (withPrefix) {
        cell.storeUint(SNAKE_CONTENT_PREFIX, 8);
    }

    const bytesToStore = getAvailableBytes(withPrefix);
    cell.storeBuffer(content.subarray(0, bytesToStore));

    const remainingContent = content.subarray(bytesToStore);
    if (remainingContent.length > 0) {
        cell.storeRef(buildSnakeCell(remainingContent, false));
    }

    return cell.endCell();
}

function buildOffchainContent(contentUri: string) {
    const content = Buffer.from(contentUri, 'ascii');
    const root = beginCell().storeUint(OFFCHAIN_CONTENT_PREFIX, 8);
    const bytesToStore = getAvailableBytes(true);

    root.storeBuffer(content.subarray(0, bytesToStore));

    const remainingContent = content.subarray(bytesToStore);
    if (remainingContent.length > 0) {
        root.storeRef(buildSnakeCell(remainingContent, false));
    }

    return root.endCell();
}

function ensureByteAligned(slice: Slice) {
    if (slice.remainingBits % 8 !== 0) {
        throw notMultiplyOf8Error;
    }
}

function readSnakeData(slice: Slice, withPrefix: boolean): Buffer {
    if (withPrefix) {
        if (slice.loadUint(8) !== SNAKE_CONTENT_PREFIX) {
            throw unsupportedFormatError;
        }
    }

    ensureByteAligned(slice);

    const current = slice.remainingBits > 0 ? slice.loadBuffer(slice.remainingBits / 8) : Buffer.alloc(0);
    if (slice.remainingRefs === 0) {
        return current;
    }
    if (slice.remainingRefs > 1) {
        throw unsupportedFormatError;
    }

    return Buffer.concat([current, readSnakeData(slice.loadRef().beginParse(), false)]);
}

function readChunkedData(slice: Slice): Buffer {
    const dict = slice.loadDict(Dictionary.Keys.Uint(32), Dictionary.Values.Cell());
    const chunks = dict.keys().sort((a, b) => a - b);

    return Buffer.concat(
        chunks.map((chunkIndex) => {
            const chunk = dict.get(chunkIndex);
            if (!chunk) {
                return Buffer.alloc(0);
            }

            return readSnakeData(chunk.beginParse(), true);
        }),
    );
}

function readContentData(cell: Cell): Buffer {
    const slice = cell.beginParse();
    const prefix = slice.loadUint(8);

    if (prefix === SNAKE_CONTENT_PREFIX) {
        return readSnakeData(slice, false);
    }
    if (prefix === CHUNKED_CONTENT_PREFIX) {
        return readChunkedData(slice);
    }

    throw unsupportedFormatError;
}

function parseOnchainMetadata<TKey extends string>(
    contentSlice: Slice,
    metadataSpec: MetadataSpec<TKey>,
): { metadata: MetadataRecord<TKey>; isJettonDeployerFaultyOnChainData: boolean } {
    const dict = contentSlice.loadDict(Dictionary.Keys.Buffer(32), Dictionary.Values.Cell());
    const metadata: MetadataRecord<TKey> = {};

    for (const key of Object.keys(metadataSpec) as TKey[]) {
        const encoding = metadataSpec[key];
        if (!encoding) {
            continue;
        }

        const cell = dict.get(sha256(key));
        if (!cell) {
            continue;
        }

        const value = readContentData(cell).toString(encoding);
        if (value) {
            metadata[key] = value as MetadataRecord<TKey>[TKey];
        }
    }

    return {
        metadata,
        isJettonDeployerFaultyOnChainData: false,
    };
}

function normalizeContentUri(contentUri: string) {
    if (contentUri.startsWith('ipfs://')) {
        const ipfsPath = contentUri.slice('ipfs://'.length).replace(/^ipfs\//, '');
        return {
            contentUri: `https://ipfs.io/ipfs/${ipfsPath}`,
            isIpfs: true,
        };
    }

    return {
        contentUri,
        isIpfs: /(^|\/)ipfs[.:/]/i.test(contentUri),
    };
}

async function fetchOffchainMetadata(contentUri: string): Promise<OffchainMetadataResult<MetadataRecord>> {
    const normalized = normalizeContentUri(contentUri);

    try {
        const response = await axios.get(normalized.contentUri);
        const metadata =
            response.data && typeof response.data === 'object' && !Array.isArray(response.data)
                ? (response.data as MetadataRecord)
                : null;

        return {
            metadata,
            isIpfs: normalized.isIpfs,
            contentUri: normalized.contentUri,
        };
    } catch {
        return {
            metadata: null,
            isIpfs: normalized.isIpfs,
            contentUri: normalized.contentUri,
        };
    }
}

async function parseOffchainMetadata(contentSlice: Slice): Promise<OffchainMetadataResult<MetadataRecord>> {
    const contentUri = readSnakeData(contentSlice, false).toString('ascii');
    return fetchOffchainMetadata(contentUri);
}

async function readMetadata<TKey extends string>(
    contentCell: Cell,
    metadataSpec: MetadataSpec<TKey>,
): Promise<ReadMetadataResult<MetadataRecord<TKey>>> {
    if (contentCell.bits.length <= 0) {
        return {
            contentUri: undefined,
            metadata: {},
            persistenceType: 'none',
        };
    }

    const contentSlice = contentCell.beginParse();
    const prefix = contentSlice.loadUint(8);

    if (prefix === ONCHAIN_CONTENT_PREFIX) {
        const { metadata: onchainMetadata, isJettonDeployerFaultyOnChainData } = parseOnchainMetadata(
            contentSlice,
            metadataSpec,
        );

        const uri = onchainMetadata.uri;
        if (typeof uri === 'string' && uri.length > 0) {
            const { metadata: offchainMetadata, isIpfs, contentUri } = await fetchOffchainMetadata(uri);
            return {
                contentUri,
                isJettonDeployerFaultyOnChainData,
                metadata: {
                    ...(offchainMetadata ?? {}),
                    ...onchainMetadata,
                },
                persistenceType: isIpfs ? 'semichain_ipfs' : 'semichain_private_domain',
            };
        }

        return {
            isJettonDeployerFaultyOnChainData,
            metadata: onchainMetadata,
            persistenceType: 'onchain',
        };
    }

    if (prefix === OFFCHAIN_CONTENT_PREFIX) {
        const { metadata, isIpfs, contentUri } = await parseOffchainMetadata(contentSlice);
        return {
            contentUri,
            metadata,
            persistenceType: isIpfs ? 'offchain_ipfs' : 'offchain_private_domain',
        };
    }

    throw prefixError;
}

function buildOnchainMetadata<TKey extends string>(data: MetadataRecord<TKey>, metadataSpec: MetadataSpec<TKey>) {
    const dict = Dictionary.empty(Dictionary.Keys.Buffer(32), Dictionary.Values.Cell());

    for (const [key, value] of Object.entries(data)) {
        const encoding = metadataSpec[key as TKey];
        if (!encoding) {
            throw unsupportedKeyError(key);
        }
        if (value === '' || value == null) {
            continue;
        }

        dict.set(sha256(key), buildSnakeCell(Buffer.from(String(value), encoding), true));
    }

    return beginCell()
        .storeUint(ONCHAIN_CONTENT_PREFIX, 8)
        .storeDict(dict, Dictionary.Keys.Buffer(32), Dictionary.Values.Cell())
        .endCell();
}

export function buildJettonOffChainMetadata(contentUri: string) {
    return buildOffchainContent(contentUri);
}

export function buildNFTOffChainMetadata(contentUri: string) {
    return buildOffchainContent(contentUri);
}

export function buildJettonOnchainMetadata(data: JettonMetadata) {
    return buildOnchainMetadata(data, jettonOnChainMetadataSpec);
}

export function buildNFTOnchainMetadata(data: NFTMetadata) {
    return buildOnchainMetadata(data, nftOnChainMetadataSpec);
}

export type persistenceType = MetadataPersistenceType;

export async function readJettonMetadata(contentCell: Cell): Promise<JettonExtendedMetadata> {
    const metadata = await readMetadata(contentCell, jettonOnChainMetadataSpec);
    return {
        ...metadata,
        isJettonDeployerFaultyOnChainData: metadata.isJettonDeployerFaultyOnChainData ?? false,
    };
}

export async function readNFTMetadata(contentCell: Cell): Promise<NFTExtendedMetadata> {
    const metadata = await readMetadata(contentCell, nftOnChainMetadataSpec);
    return {
        contentUri: metadata.contentUri,
        metadata: metadata.metadata,
        persistenceType: metadata.persistenceType,
    };
}
