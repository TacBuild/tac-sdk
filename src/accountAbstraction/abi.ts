// Minimal human-readable ABIs for TAC account-abstraction contracts. Kept in sync
// with aa-contracts#tac:
//   contracts/accounts/TacAccount.sol
//   contracts/accounts/TacAccountFactory.sol
//   contracts/accounts/TacBaseAccount.sol  (execute / executeBatch surface)
//   contracts/paymaster/TacERC20Paymaster.sol  (read surface for SDK clients)

export const TacAccountFactoryABI = [
    'function getOrCreateAccount(bytes32 publicKey) external returns (address)',
    'function getAccountAddress(bytes32 publicKey) public view returns (address)',
];

export const TacAccountABI = [
    // From TacBaseAccount (execute surface)
    'function execute(address target, uint256 value, bytes calldata data) external',
    'function executeBatch(tuple(address target, uint256 value, bytes data)[] calls) external',
    // From IAccount + TacBaseAccount
    'function getNonce() public view returns (uint256)',
    'function getNonce(uint192 key) public view returns (uint256)',
    // From TacAccount
    'function publicKey() public view returns (bytes32)',
    'function entryPoint() public view returns (address)',
];

export const TacERC20PaymasterABI = [
    'function token() public view returns (address)',
    'function tacPermit2() public view returns (address)',
    'function priceMarkup() public view returns (uint32)',
    'function refundPostOpCost() public view returns (uint256)',
    'function internalBalance(address account) public view returns (uint256)',
    'function getPrice() public view returns (uint192)',
];
