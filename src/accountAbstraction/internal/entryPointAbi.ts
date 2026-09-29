// Minimal human-readable ABI for the ERC-4337 v0.8 EntryPoint — only the surface
// the account APIs use: on-chain userOpHash, counterfactual-address probing, and
// the UserOperationEvent. Vendored so this module needs no @account-abstraction dep.

export const IEntryPointABI = [
    // off-chain-matching userOpHash (avoids re-implementing EIP-712 packing in the SDK)
    'function getUserOpHash((address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature) userOp) view returns (bytes32)',
    // reverts with SenderAddressResult(sender) — used to derive an undeployed account address
    'function getSenderAddress(bytes initCode)',
    'error SenderAddressResult(address sender)',
    'function senderCreator() view returns (address)',
    'function getNonce(address sender, uint192 key) view returns (uint256)',
    'event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)',
] as const;
