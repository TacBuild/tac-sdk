import ICrossChainLayer from "../l2-evm/artifacts/contracts/interfaces/ICrossChainLayer.sol/ICrossChainLayer.json";
import ISettings from "../l2-evm/artifacts/contracts/interfaces/ISettings.sol/ISettings.json";
import ITokenUtils from "../l2-evm/artifacts/contracts/interfaces/ITokenUtils.sol/ITokenUtils.json";

import CrossChainLayer from "../l2-evm/artifacts/contracts/core/CrossChainLayer.sol/CrossChainLayer.json";
import CrossChainLayerToken from "../l2-evm/artifacts/contracts/core/tokens/CrossChainLayerERC20.sol/CrossChainLayerERC20.json";
import Settings from "../l2-evm/artifacts/contracts/core/Settings.sol/Settings.json";
import CrossChainLayerNFT from "../l2-evm/artifacts/contracts/core/tokens/CrossChainLayerERC721.sol/CrossChainLayerERC721.json";
import ISAFactory from "../l2-evm/artifacts/contracts/smart-account/interfaces/ISAFactory.sol/ISAFactory.json";
import ITacSmartAccount from "../l2-evm/artifacts/contracts/smart-account/interfaces/ITacSmartAccount.sol/ITacSmartAccount.json";

export const compilationArtifacts = {
  ICrossChainLayer,
  ISettings,
  ITokenUtils,
  CrossChainLayer,
  CrossChainLayerToken,
  Settings,
  CrossChainLayerNFT,
  ISAFactory,
  ITacSmartAccount,
};