// TAC account-abstraction (ERC-4337) client — native ethers v6.
// Drive a TAC smart account from a TON Ed25519 key: build + sign UserOperations,
// send them to the bundler, and pay gas natively or in an ERC-20 via the paymaster.

export { TacAccountABI, TacAccountFactoryABI, TacERC20PaymasterABI } from './abi';
export type { BaseApiParams, UserOpResult } from './BaseAccountAPI';
export { BaseAccountAPI } from './BaseAccountAPI';
export type { Ed25519Signature, Ed25519Signer, TonConnectSignedParts, TonConnectSigner } from './Ed25519';
export {
    buildPermitBinding,
    ed25519SignerFromSecretKey,
    packPermit2InnerSignature,
    packPermitBoundUserOpSignature,
    packRawEd25519Signature,
    packTonConnectPermit2InnerSignature,
    packTonConnectUserOpSignature,
} from './Ed25519';
export { HttpRpcClient } from './HttpRpcClient';
export type { UserOperation } from './internal/userOp';
export type { AaAddresses, AaNetworkConfig } from './networks';
export { AA_NETWORKS } from './networks';
export type { PaymasterParams } from './PaymasterAPI';
export { PaymasterAPI } from './PaymasterAPI';
export type { Permit2TokenPermission, PermitBatchTransferFromInput, PermitBatchTransferFromTuple } from './Permit2';
export { buildPermitMessage, packPermitData, packPermitPaymasterData } from './Permit2';
export type { BuildPermitUserOpInput, BuildPermitUserOpInputTonConnect } from './PermitFlow';
export { buildSignedUserOpWithPermit, buildSignedUserOpWithPermitTonConnect } from './PermitFlow';
export type { AaSignerResult } from './signer';
export { aaSignerFromMnemonic } from './signer';
export type { TacAccountApiParams } from './TacAccountAPI';
export { TacAccountAPI } from './TacAccountAPI';
export type {
    PermitOptions,
    SendTx,
    TacAccountSdkParams,
    UserOpReceipt,
    UserOpSendResult,
} from './TacAccountSdk';
export { TacAccountSdk } from './TacAccountSdk';
export type { TacERC20PaymasterApiParams } from './TacERC20PaymasterAPI';
export { packModeByte, packPaymasterAndData, TacERC20PaymasterAPI, TacPaymasterMode } from './TacERC20PaymasterAPI';
export type { TransactionDetailsForUserOp } from './TransactionDetailsForUserOp';
