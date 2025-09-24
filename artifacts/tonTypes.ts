import type * as Dev from './dev';
import type * as Testnet from './testnet';
import type * as Mainnet from './mainnet';

// TON wrappers
export type MsgType = Dev.ton.wrappers.MsgType | Testnet.ton.wrappers.MsgType | Mainnet.ton.wrappers.MsgType;

export type CrossChainLayer = Dev.ton.wrappers.CrossChainLayer | Testnet.ton.wrappers.CrossChainLayer | Mainnet.ton.wrappers.CrossChainLayer;
export type CrossChainLayerData = Dev.ton.wrappers.CrossChainLayerConfig | Testnet.ton.wrappers.CrossChainLayerConfig | Mainnet.ton.wrappers.CrossChainLayerConfig;

export type JettonMinter = Dev.ton.wrappers.JettonMinter | Testnet.ton.wrappers.JettonMinter | Mainnet.ton.wrappers.JettonMinter;
export type JettonMinterData = Dev.ton.wrappers.JettonMinterData | Testnet.ton.wrappers.JettonMinterData | Mainnet.ton.wrappers.JettonMinterData;

export type JettonWallet = Dev.ton.wrappers.JettonWallet | Testnet.ton.wrappers.JettonWallet | Mainnet.ton.wrappers.JettonWallet;
export type JettonWalletData = Dev.ton.wrappers.JettonWalletData | Testnet.ton.wrappers.JettonWalletData | Mainnet.ton.wrappers.JettonWalletData;

export type JettonProxy = Dev.ton.wrappers.JettonProxy | Testnet.ton.wrappers.JettonProxy | Mainnet.ton.wrappers.JettonProxy;
export type JettonProxyData = Dev.ton.wrappers.JettonProxyConfig | Testnet.ton.wrappers.JettonProxyConfig | Mainnet.ton.wrappers.JettonProxyConfig;

export type Settings = Dev.ton.wrappers.Settings | Testnet.ton.wrappers.Settings | Mainnet.ton.wrappers.Settings;
export type SettingsData = Dev.ton.wrappers.SettingsConfig | Testnet.ton.wrappers.SettingsConfig | Mainnet.ton.wrappers.SettingsConfig;

export type NFTCollection = Dev.ton.wrappers.NFTCollection | Testnet.ton.wrappers.NFTCollection | Mainnet.ton.wrappers.NFTCollection;
export type NFTCollectionData = Dev.ton.wrappers.NFTCollectionData | Testnet.ton.wrappers.NFTCollectionData | Mainnet.ton.wrappers.NFTCollectionData;

export type NFTItem = Dev.ton.wrappers.NFTItem | Testnet.ton.wrappers.NFTItem | Mainnet.ton.wrappers.NFTItem;
export type NFTItemData = Dev.ton.wrappers.NFTItemData | Testnet.ton.wrappers.NFTItemData | Mainnet.ton.wrappers.NFTItemData;

export type NFTProxy = Dev.ton.wrappers.NFTProxy | Testnet.ton.wrappers.NFTProxy | Mainnet.ton.wrappers.NFTProxy;
export type NFTProxyData = Dev.ton.wrappers.NFTProxyConfig | Testnet.ton.wrappers.NFTProxyConfig | Mainnet.ton.wrappers.NFTProxyConfig;
