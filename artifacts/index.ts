import * as dev from "./dev";
import * as testnet from "./testnet";
import * as mainnet from "./mainnet";

export { dev, testnet, mainnet };

export type CrossChainLayerFactoryTAC = dev.tac.wrappers.CrossChainLayerFactoryTAC | testnet.tac.wrappers.CrossChainLayerFactoryTAC | mainnet.tac.wrappers.CrossChainLayerFactoryTAC;
export type TokenUtilsFactoryTAC = dev.tac.wrappers.TokenUtilsFactoryTAC | testnet.tac.wrappers.TokenUtilsFactoryTAC | mainnet.tac.wrappers.TokenUtilsFactoryTAC;
export type SettingsFactoryTAC = dev.tac.wrappers.SettingsFactoryTAC | testnet.tac.wrappers.SettingsFactoryTAC | mainnet.tac.wrappers.SettingsFactoryTAC;
export type ERC20FactoryTAC = dev.tac.wrappers.ERC20FactoryTAC | testnet.tac.wrappers.ERC20FactoryTAC | mainnet.tac.wrappers.ERC20FactoryTAC;
export type ERC721FactoryTAC = dev.tac.wrappers.ERC721FactoryTAC | testnet.tac.wrappers.ERC721FactoryTAC | mainnet.tac.wrappers.ERC721FactoryTAC;
export type CrossChainLayerERC721FactoryTAC = dev.tac.wrappers.CrossChainLayerERC721FactoryTAC | testnet.tac.wrappers.CrossChainLayerERC721FactoryTAC | mainnet.tac.wrappers.CrossChainLayerERC721FactoryTAC;
export type CrossChainLayerERC20FactoryTAC = dev.tac.wrappers.CrossChainLayerERC20FactoryTAC | testnet.tac.wrappers.CrossChainLayerERC20FactoryTAC | mainnet.tac.wrappers.CrossChainLayerERC20FactoryTAC;
export type TacSAFactoryFactoryTAC = dev.tac.wrappers.TacSAFactoryTAC | testnet.tac.wrappers.TacSAFactoryTAC | mainnet.tac.wrappers.TacSAFactoryTAC;
export type TacSmartAccountFactoryTAC = dev.tac.wrappers.TacSmartAccountTAC | testnet.tac.wrappers.TacSmartAccountTAC | mainnet.tac.wrappers.TacSmartAccountTAC;

export type CrossChainLayerTAC = dev.tac.wrappers.CrossChainLayerTAC | testnet.tac.wrappers.CrossChainLayerTAC | mainnet.tac.wrappers.CrossChainLayerTAC;
export type TacSAFactoryTAC = dev.tac.wrappers.TacSAFactoryTAC | testnet.tac.wrappers.TacSAFactoryTAC | mainnet.tac.wrappers.TacSAFactoryTAC;
export type TacSmartAccountTAC = dev.tac.wrappers.TacSmartAccountTAC | testnet.tac.wrappers.TacSmartAccountTAC | mainnet.tac.wrappers.TacSmartAccountTAC;
export type SettingsTAC = dev.tac.wrappers.SettingsTAC | testnet.tac.wrappers.SettingsTAC | mainnet.tac.wrappers.SettingsTAC;
export type TokenUtilsTAC = dev.tac.wrappers.TokenUtilsTAC | testnet.tac.wrappers.TokenUtilsTAC | mainnet.tac.wrappers.TokenUtilsTAC;

export type OutMessageV1Struct = dev.tac.structs.OutMessageV1Struct | testnet.tac.structs.OutMessageV1Struct | mainnet.tac.structs.OutMessageV1Struct;

export type CrossChainLayer = dev.ton.wrappers.CrossChainLayer | testnet.ton.wrappers.CrossChainLayer | mainnet.ton.wrappers.CrossChainLayer;
export type OperationType = dev.ton.wrappers.OperationType | testnet.ton.wrappers.OperationType | mainnet.ton.wrappers.OperationType;
export type JettonMinter = dev.ton.wrappers.JettonMinter | testnet.ton.wrappers.JettonMinter | mainnet.ton.wrappers.JettonMinter;
export type JettonWallet = dev.ton.wrappers.JettonWallet | testnet.ton.wrappers.JettonWallet | mainnet.ton.wrappers.JettonWallet;
export type JettonProxy = dev.ton.wrappers.JettonProxy | testnet.ton.wrappers.JettonProxy | mainnet.ton.wrappers.JettonProxy;
export type Settings = dev.ton.wrappers.Settings | testnet.ton.wrappers.Settings | mainnet.ton.wrappers.Settings;
export type NFTCollection = dev.ton.wrappers.NFTCollection | testnet.ton.wrappers.NFTCollection | mainnet.ton.wrappers.NFTCollection;
export type NFTItem = dev.ton.wrappers.NFTItem | testnet.ton.wrappers.NFTItem | mainnet.ton.wrappers.NFTItem;
export type NFTProxy = dev.ton.wrappers.NFTProxy | testnet.ton.wrappers.NFTProxy | mainnet.ton.wrappers.NFTProxy;
