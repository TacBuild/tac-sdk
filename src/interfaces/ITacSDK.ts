import { Wallet } from 'ethers';

import { FT, NFT } from '../assets';
import type { SenderAbstraction } from '../sender';
import {
    AssetFromFTArg,
    AssetFromNFTCollectionArg,
    AssetFromNFTItemArg,
    AssetLike,
    CrossChainTransactionOptions,
    CrosschainTx,
    CrosschainTxWithAssetLike,
    EVMAddress,
    EvmProxyMsg,
    ExecutionFeeEstimationResult,
    NFTAddressType,
    NFTItemData,
    OperationIdsByShardsKey,
    SuggestedTVMExecutorFee,
    TACSimulationParams,
    TACSimulationResult,
    TransactionLinkerWithOperationId,
    TVMAddress,
    UserWalletBalanceExtended,
    WaitOptions,
} from '../structs/Struct';
import { JettonMasterData } from '../wrappers/JettonMaster';
import { Asset } from './Asset';
import { IConfiguration } from './IConfiguration';
import { IOperationTracker } from './IOperationTracker';

export interface ITacSDK {
    readonly config: IConfiguration;

    // Configuration getters
    /**
     * TON native token (TON coin) address configured for the current network.
     * @returns TON address string.
     */
    get nativeTONAddress(): string;
    /**
     * Returns the TAC (TON App Chain) native token address for the current network.
     * @returns Promise that resolves to the TAC token master address.
     */
    nativeTACAddress(): Promise<string>;
    /**
     * List of TAC (EVM-side) executor addresses considered trusted for fee payments/validations.
     */
    get getTrustedTACExecutors(): string[];
    /**
     * List of TON (TVM-side) executor addresses considered trusted for fee payments/validations.
     */
    get getTrustedTONExecutors(): string[];

    // Connection management
    /**
     * Closes any underlying network connections, clients, or subscriptions established by the SDK.
     * Implementations should be idempotent and safe to call multiple times.
     */
    closeConnections(): unknown;

    // Asset methods
    /**
     * Creates a typed asset wrapper instance based on provided arguments.
     * Pass FT, NFT collection or NFT item parameters; the returned type will match the input.
     * @param args Parameters that describe the asset to wrap (FT/NFT collection/NFT item).
     * @returns Promise resolving to a generic Asset. Use overloads for stronger typing.
     */
    getAsset(args: AssetFromFTArg | AssetFromNFTCollectionArg | AssetFromNFTItemArg): Promise<Asset>;
    getAsset(args: AssetFromFTArg): Promise<FT>;
    getAsset(args: AssetFromNFTCollectionArg): Promise<NFT>;
    getAsset(args: AssetFromNFTItemArg): Promise<NFT>;

    // Special asset methods
    /**
     * Returns a fungible token (Jetton) asset wrapper by its TVM or EVM address.
     * @param address TVM or EVM token address.
     * @returns Promise resolving to an FT wrapper.
     */
    getFT(address: TVMAddress | EVMAddress): Promise<FT>;
    /**
     * Returns an NFT asset wrapper for either a collection or a specific item.
     * @param args NFT collection parameters or NFT item parameters.
     * @returns Promise resolving to an NFT wrapper.
     */
    getNFT(args: AssetFromNFTCollectionArg | AssetFromNFTItemArg): Promise<NFT>;

    // Simulation methods
    /**
     * Simulates a TAC message execution without broadcasting it on-chain.
     * Useful for estimating fees and validating transaction inputs.
     * @param req Simulation request with encoded message and context.
     * @returns Promise with the detailed simulation result.
     */
    simulateTACMessage(req: TACSimulationParams): Promise<TACSimulationResult>;
    /**
     * Simulates a batch of cross-chain transactions from a given sender.
     * @param sender Abstracted sender used for simulation context (not broadcasting).
     * @param txs Array of cross-chain transactions to simulate.
     * @returns Promise with an array of fee estimation results matching the input order.
     */
    simulateTransactions(sender: SenderAbstraction, txs: CrosschainTx[]): Promise<ExecutionFeeEstimationResult[]>;
    /**
     * Get tvm fees and simulation info for a tvm transaction using sender abstraction.
     * @param evmProxyMsg Encoded EVM proxy message.
     * @param sender Sender abstraction used to provide context (e.g., wallet state).
     * @param assets Assets to be included in the transaction.
     * @param options Optional transaction configuration including error handling and executor settings.
     * @returns Promise with fee estimation and execution info.
     */
    getSimulationInfo(
        evmProxyMsg: EvmProxyMsg,
        sender: SenderAbstraction,
        assets?: AssetLike[],
        options?: CrossChainTransactionOptions,
    ): Promise<ExecutionFeeEstimationResult>;
    /**
     * Suggests optimal TON-side executor fee for a given asset set and fee symbol.
     * @param assets Assets to be processed on TON side.
     * @param feeSymbol Symbol (ticker) to express the fee in.
     * @param tvmValidExecutors Optional whitelist of allowed TVM executors.
     * @returns Promise with suggested fee details.
     */
    getTVMExecutorFeeInfo(
        assets: AssetLike[],
        feeSymbol: string,
        tvmValidExecutors?: string[],
    ): Promise<SuggestedTVMExecutorFee>;

    // Transaction methods
    /**
     * Sends a single cross-chain transaction and optionally waits for tracking information.
     * @param evmProxyMsg Encoded EVM proxy message to be bridged.
     * @param sender Sender abstraction responsible for signing/sending TVM messages.
     * @param assets Optional list of assets to attach to the cross-chain message.
     * @param options Optional cross-chain options (fees, executors, extra data, etc.).
     * @param waitOptions Optional waiting policy for operation id resolution.
     * @returns Promise with a TransactionLinkerWithOperationId to track the operation across chains.
     */
    sendCrossChainTransaction(
        evmProxyMsg: EvmProxyMsg,
        sender: SenderAbstraction,
        assets?: AssetLike[],
        options?: CrossChainTransactionOptions,
        waitOptions?: WaitOptions<string>,
    ): Promise<TransactionLinkerWithOperationId>;
    /**
     * Sends multiple cross-chain transactions in one batch and optionally waits for tracking info.
     * @param sender Sender abstraction for signing/sending TVM messages.
     * @param txs Array of cross-chain transactions to broadcast.
     * @param waitOptions Optional waiting policy for operation ids by shard keys.
     * @returns Promise with an array of TransactionLinkerWithOperationId for each submitted transaction.
     */
    sendCrossChainTransactions(
        sender: SenderAbstraction,
        txs: CrosschainTxWithAssetLike[],
        waitOptions?: WaitOptions<OperationIdsByShardsKey>,
    ): Promise<TransactionLinkerWithOperationId[]>;

    // Bridge methods
    /**
     * Bridges tokens/value from EVM to TON chain via the executor.
     * @param signer Ethers Wallet used to sign the EVM-side transaction.
     * @param value Amount of native EVM currency to bridge (in wei as bigint).
     * @param tonTarget Recipient TVM address on TON.
     * @param assets Optional list of TAC assets to include for the bridge.
     * @param tvmExecutorFee Optional explicit TON-side executor fee.
     * @param tvmValidExecutors Optional whitelist of allowed TVM executors.
     * @returns Promise resolving to the EVM transaction hash or bridge identifier.
     */
    bridgeTokensToTON(
        signer: Wallet,
        value: bigint,
        tonTarget: string,
        assets?: AssetLike[],
        tvmExecutorFee?: bigint,
        tvmValidExecutors?: string[],
    ): Promise<string>;

    // Jetton methods
    /**
     * Returns the user's Jetton wallet address for a given Jetton master (token) address.
     * @param userAddress TVM user address.
     * @param tokenAddress Jetton master address.
     * @returns Promise resolving to the Jetton wallet address.
     */
    getUserJettonWalletAddress(userAddress: string, tokenAddress: string): Promise<string>;
    /**
     * Returns Jetton balance for a user and a given Jetton master address.
     * @param userAddress TVM user address.
     * @param tokenAddress Jetton master address.
     * @returns Promise resolving to the balance in raw base units (bigint).
     */
    getUserJettonBalance(userAddress: string, tokenAddress: string): Promise<bigint>;
    /**
     * Returns extended Jetton wallet information including balance and metadata.
     * @param userAddress TVM user address.
     * @param tokenAddress Jetton master address.
     * @returns Promise resolving to extended wallet data.
     */
    getUserJettonBalanceExtended(userAddress: string, tokenAddress: string): Promise<UserWalletBalanceExtended>;
    /**
     * Returns Jetton master data (metadata and configuration) for a given Jetton master address.
     * @param itemAddress Jetton master TVM address.
     * @returns Promise resolving to JettonMasterData.
     */
    getJettonData(itemAddress: TVMAddress): Promise<JettonMasterData>;

    // NFT methods
    /**
     * Returns NFT item data for the specified TVM address.
     * @param itemAddress TVM address of the NFT item.
     * @returns Promise resolving to the NFT item data.
     */
    getNFTItemData(itemAddress: TVMAddress): Promise<NFTItemData>;

    // Address conversion methods
    /**
     * Resolves the EVM token address that corresponds to the provided TVM token address.
     * @param tvmTokenAddress TVM token (Jetton) master address.
     * @returns Promise resolving to the EVM token address.
     */
    getEVMTokenAddress(tvmTokenAddress: string): Promise<string>;
    /**
     * Resolves the TVM token address that corresponds to the provided EVM token address.
     * @param evmTokenAddress EVM token contract address (checksum string).
     * @returns Promise resolving to the TVM token (Jetton) master address.
     */
    getTVMTokenAddress(evmTokenAddress: string): Promise<string>;
    /**
     * Resolves the TVM NFT address for a given EVM NFT contract and optional token id.
     * @param evmNFTAddress EVM NFT contract address.
     * @param tokenId Optional NFT token id; when omitted, returns the collection address if applicable.
     * @returns Promise resolving to the TVM NFT address.
     */
    getTVMNFTAddress(evmNFTAddress: string, tokenId?: number | bigint): Promise<string>;
    /**
     * Resolves the EVM NFT address for a given TVM NFT address and desired address type.
     * @param tvmNFTAddress TVM NFT item or collection address.
     * @param addressType Desired address type on EVM side (collection or item).
     * @returns Promise resolving to the EVM NFT address.
     */
    getEVMNFTAddress(tvmNFTAddress: string, addressType: NFTAddressType): Promise<string>;

    // Utility methods
    /**
     * Checks whether a contract is deployed at the provided TVM address on the current network.
     * @param address TVM address to check.
     * @returns Promise resolving to true if deployed, false otherwise.
     */
    isContractDeployedOnTVM(address: string): Promise<boolean>;

    /**
     * Returns the operation tracker instance used for querying operation statuses and utilities.
     */
    getOperationTracker(): IOperationTracker;
}
