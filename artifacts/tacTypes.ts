import type * as Dev from './dev';
import type * as Testnet from './testnet';
import type * as Mainnet from './mainnet';

// TAC wrappers

export type ICrossChainLayer = Dev.tac.wrappers.ICrossChainLayer | Testnet.tac.wrappers.ICrossChainLayer | Mainnet.tac.wrappers.ICrossChainLayer;
export type ISAFactory = Dev.tac.wrappers.ISAFactory | Testnet.tac.wrappers.ISAFactory | Mainnet.tac.wrappers.ISAFactory;
export type ITacSmartAccount = Dev.tac.wrappers.ITacSmartAccount | Testnet.tac.wrappers.ITacSmartAccount | Mainnet.tac.wrappers.ITacSmartAccount;
export type ISettings = Dev.tac.wrappers.ISettings | Testnet.tac.wrappers.ISettings | Mainnet.tac.wrappers.ISettings;
export type ITokenUtils = Dev.tac.wrappers.ITokenUtils | Testnet.tac.wrappers.ITokenUtils | Mainnet.tac.wrappers.ITokenUtils;
export type ERC20 = Dev.tac.wrappers.ERC20 | Testnet.tac.wrappers.ERC20 | Mainnet.tac.wrappers.ERC20;
export type ERC721 = Dev.tac.wrappers.ERC721 | Testnet.tac.wrappers.ERC721 | Mainnet.tac.wrappers.ERC721;
export type ICrossChainLayerERC20 = Dev.tac.wrappers.ICrossChainLayerERC20 | Testnet.tac.wrappers.ICrossChainLayerERC20 | Mainnet.tac.wrappers.ICrossChainLayerERC20;
export type ICrossChainLayerERC721 = Dev.tac.wrappers.ICrossChainLayerERC721 | Testnet.tac.wrappers.ICrossChainLayerERC721 | Mainnet.tac.wrappers.ICrossChainLayerERC721;

export type OutMessageV1Struct = Dev.tac.structs.OutMessageV1Struct | Testnet.tac.structs.OutMessageV1Struct | Mainnet.tac.structs.OutMessageV1Struct;
