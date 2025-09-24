import ICrossChainLayer from "./internal/artifacts/contracts/interfaces/ICrossChainLayer.sol/ICrossChainLayer.json";
import ISettings from "./internal/artifacts/contracts/interfaces/ISettings.sol/ISettings.json";
import ITokenUtils from "./internal/artifacts/contracts/interfaces/ITokenUtils.sol/ITokenUtils.json";
import ICrossChainLayerERC20 from "./internal/artifacts/contracts/interfaces/tokens/ICrossChainLayerERC20.sol/ICrossChainLayerERC20.json";
import ICrossChainLayerERC721 from "./internal/artifacts/contracts/interfaces/tokens/ICrossChainLayerERC721.sol/ICrossChainLayerERC721.json";
import ISAFactory from "./internal/artifacts/contracts/smart-account/interfaces/ISAFactory.sol/ISAFactory.json";
import ITacSmartAccount from "./internal/artifacts/contracts/smart-account/interfaces/ITacSmartAccount.sol/ITacSmartAccount.json";
import ERC20 from "./internal/artifacts/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json";
import ERC721 from "./internal/artifacts/@openzeppelin/contracts/token/ERC721/ERC721.sol/ERC721.json";

export const compilationArtifacts = {
  ICrossChainLayer,
  ISettings,
  ITokenUtils,
  ICrossChainLayerERC20,
  ICrossChainLayerERC721,
  ISAFactory,
  ITacSmartAccount,
  ERC20,
  ERC721,
};