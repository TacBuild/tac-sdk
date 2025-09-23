import CrossChainLayer from "./internal/artifacts/contracts/core/CrossChainLayer.sol/CrossChainLayer.json";
import Settings from "./internal/artifacts/contracts/core/Settings.sol/Settings.json";
import CrossChainLayerToken from "./internal/artifacts/contracts/core/tokens/CrossChainLayerERC20.sol/CrossChainLayerERC20.json";
import CrossChainLayerNFT from "./internal/artifacts/contracts/core/tokens/CrossChainLayerERC721.sol/CrossChainLayerERC721.json";
import ICrossChainLayer from "./internal/artifacts/contracts/interfaces/ICrossChainLayer.sol/ICrossChainLayer.json";
import ISettings from "./internal/artifacts/contracts/interfaces/ISettings.sol/ISettings.json";
import ITokenUtils from "./internal/artifacts/contracts/interfaces/ITokenUtils.sol/ITokenUtils.json";
import ISAFactory from "./internal/artifacts/contracts/smart-account/interfaces/ISAFactory.sol/ISAFactory.json";
import ITacSmartAccount from "./internal/artifacts/contracts/smart-account/interfaces/ITacSmartAccount.sol/ITacSmartAccount.json";

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