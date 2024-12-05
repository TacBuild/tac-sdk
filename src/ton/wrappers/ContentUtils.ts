// noinspection TypeScriptValidateTypes

import { beginCell, Builder, Cell, Dictionary, Slice } from '@ton/core';
import { Sha256 } from '@aws-crypto/sha256-js';
import axios from 'axios';
import BN from 'bn.js';

export const ONCHAIN_CONTENT_PREFIX = 0x00;
export const OFFCHAIN_CONTENT_PREFIX = 0x01;

const SNAKE_PREFIX = 0x00;

export interface JettonMetadata {
  uri?: string;
  name: string;
  description: string;
  image?: string;
  image_data?: string;
  symbol: string;
  decimals?: string;
}

export type JettonExtendedMetadata = {
  persistenceType: persistenceType;
  metadata: { [s in JettonMetaDataKeys]?: string };
  isJettonDeployerFaultyOnChainData?: boolean;
  contentUri?: string;
};

export function buildJettonOffChainMetadata(contentUri: string) {
  return beginCell()
    .storeInt(OFFCHAIN_CONTENT_PREFIX, 8)
    .storeBuffer(Buffer.from(contentUri, 'ascii'))
    .endCell();
}

export type JettonMetaDataKeys =
  | 'uri'
  | 'name'
  | 'description'
  | 'image'
  | 'symbol'
  | 'image_data'
  | 'decimals';

const jettonOnChainMetadataSpec: {
  [key in JettonMetaDataKeys]: 'utf8' | 'ascii' | undefined;
} = {
  uri: 'ascii',
  name: 'utf8',
  description: 'utf8',
  image: 'ascii',
  image_data: 'ascii',
  symbol: 'utf8',
  decimals: 'utf8',
};

const sha256 = (str: string) => {
  const sha = new Sha256();
  sha.update(str);
  return Buffer.from(sha.digestSync());
};

function storeSnakeContent(content: Buffer, isFirst: boolean): Cell {
  const CELL_MAX_SIZE_BYTES = Math.floor((1023 - 8) / 8);
  const cell = new Builder();
  if (isFirst) {
    cell.storeUint(SNAKE_PREFIX, 8);
  }
  cell.storeBuffer(content.subarray(0, CELL_MAX_SIZE_BYTES));
  const remainingContent = content.subarray(CELL_MAX_SIZE_BYTES);
  if (remainingContent.length > 0) {
    cell.storeRef(storeSnakeContent(remainingContent, false));
  }
  return cell.endCell();
}

export function buildJettonOnchainMetadata(data: JettonMetadata) {
  const dict = Dictionary.empty();

  Object.entries(data).forEach(([k, v]: [string, string | undefined]) => {
    if (!jettonOnChainMetadataSpec[k as JettonMetaDataKeys]) {
      throw new Error(`Unsupported onchain key: ${k}`);
    }
    if (!v || v == '' || v == null) {
      return;
    }

    const bufferToStore = Buffer.from(
      v,
      jettonOnChainMetadataSpec[k as JettonMetaDataKeys],
    );

    dict.set(sha256(k), storeSnakeContent(bufferToStore, true));
  });

  return beginCell()
    .storeInt(ONCHAIN_CONTENT_PREFIX, 8)
    .storeDict(dict, Dictionary.Keys.Buffer(32), Dictionary.Values.Cell())
    .endCell();
}

function readSnakeContent(slice: Slice, isFirst: boolean): Buffer {
  if (isFirst && slice.loadUint(8) !== SNAKE_PREFIX) {
    throw new Error('Only snake format is supported');
  }

  if (slice.remainingBits % 8 !== 0) {
    throw new Error('Number remaining of bits is not multiply of 8');
  }

  let remainingBytes = Buffer.from('');

  if (slice.remainingBits != 0) {
    remainingBytes = slice.loadBuffer(slice.remainingBits / 8);
  }

  if (slice.remainingRefs != 0) {
    const newCell = slice.loadRef();
    remainingBytes = Buffer.concat([
      remainingBytes,
      readSnakeContent(newCell.beginParse(), false),
    ]);
  }
  return remainingBytes;
}

function parseJettonOnchainMetadata(contentSlice: Slice): {
  metadata: { [s in JettonMetaDataKeys]?: string };
  isJettonDeployerFaultyOnChainData: boolean;
} {
  // Note that this relies on what is (perhaps) an internal implementation detail:
  // "sdk" library dict parser converts: key (provided as buffer) => BN(base10)
  // and upon parsing, it reads it back to a BN(base10)
  // tl;dr if we want to read the map back to a JSON with string keys, we have to convert BN(10) back to hex
  const toKey = (str: string) => BigInt(new BN(str, 'hex').toString(10));

  const isJettonDeployerFaultyOnChainData = false;

  const cellDict = contentSlice.loadDict(
    Dictionary.Keys.BigUint(256),
    Dictionary.Values.Cell(),
  );

  const dict = new Map<bigint, Buffer>();

  cellDict.values().forEach((item, index) => {
    dict.set(cellDict.keys()[index], readSnakeContent(item.beginParse(), true));
  });

  const res: { [s in JettonMetaDataKeys]?: string } = {};

  Object.keys(jettonOnChainMetadataSpec).forEach((k) => {
    const val = dict
      .get(toKey(sha256(k).toString('hex')))
      ?.toString(jettonOnChainMetadataSpec[k as JettonMetaDataKeys]);
    if (val) {
      res[k as JettonMetaDataKeys] = val;
    }
  });

  return {
    metadata: res,
    isJettonDeployerFaultyOnChainData,
  };
}

async function parseJettonOffchainMetadata(contentSlice: Slice): Promise<{
  metadata: { [s in JettonMetaDataKeys]?: string };
  isIpfs: boolean | null;
  contentUri: string;
}> {
  const remainingBits = contentSlice.remainingBits;

  if (remainingBits % 8 !== 0) {
    throw new Error('Number remaining of bits is not multiply of 8');
  }

  const jsonURI = contentSlice
    .loadBuffer(remainingBits / 8)
    .toString('ascii')
    .replace('ipfs://', 'https://ipfs.io/ipfs/');

  let metadata = null;
  let isIpfs = null;
  try {
    metadata = (await axios.get(jsonURI)).data;
    isIpfs = /(^|\/)ipfs[.:]/.test(jsonURI);
  } catch {
    // nothing
  }
  return {
    metadata,
    isIpfs,
    contentUri: jsonURI,
  };
}

export type persistenceType =
  | 'none'
  | 'onchain'
  | 'offchain_private_domain'
  | 'offchain_ipfs';

export async function readJettonMetadata(
  contentCell: Cell,
): Promise<JettonExtendedMetadata> {
  if (contentCell.bits.length <= 0) {
    return {
      contentUri: undefined,
      isJettonDeployerFaultyOnChainData: false,
      metadata: {},
      persistenceType: 'none',
    };
  }
  const contentSlice = contentCell.beginParse();
  switch (contentSlice.loadUint(8)) {
    case ONCHAIN_CONTENT_PREFIX:
      return {
        persistenceType: 'onchain',
        ...parseJettonOnchainMetadata(contentSlice),
      };
    case OFFCHAIN_CONTENT_PREFIX: {
      const { metadata, isIpfs, contentUri } =
        await parseJettonOffchainMetadata(contentSlice);
      return {
        persistenceType: isIpfs ? 'offchain_ipfs' : 'offchain_private_domain',
        contentUri,
        metadata,
      };
    }
    default:
      throw new Error('Unexpected wrappers metadata content prefix');
  }
}
