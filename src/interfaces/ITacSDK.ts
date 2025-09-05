import { Wallet } from 'ethers';

import type { SenderAbstraction } from '../sender';
import {
    AssetFromFTArg,
    AssetFromNFTCollectionArg,
    AssetFromNFTItemArg,
    CrossChainTransactionOptions,
    CrosschainTx,
    EVMAddress,
    EvmProxyMsg,
    ExecutionFeeEstimationResult,
    NFTAddressType,
    NFTItemData,
    OperationIdsByShardsKey,
    SuggestedTONExecutorFee,
    TACSimulationRequest,
    TACSimulationResult,
    TransactionLinkerWithOperationId,
    TVMAddress,
    UserWalletBalanceExtended,
    WaitOptions,
} from '../structs/Struct';
import { IConfiguration } from './IConfiguration';
import { Asset } from './Asset';
import { FT, NFT } from '../assets';
import { JettonMasterData } from '../wrappers/JettonMaster';

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
     * @returns Promise resolving to a generic IAsset. Use overloads for stronger typing.
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
    simulateTACMessage(req: TACSimulationRequest): Promise<TACSimulationResult>;
    /**
     * Simulates a batch of cross-chain transactions from a given sender.
     * @param sender Abstracted sender used for simulation context (not broadcasting).
     * @param txs Array of cross-chain transactions to simulate.
     * @returns Promise with an array of results matching the input order.
     */
    simulateTransactions(sender: SenderAbstraction, txs: CrosschainTx[]): Promise<TACSimulationResult[]>;
    /**
     * Computes fee and execution information for a prospective transaction.
     * @param evmProxyMsg Encoded EVM proxy message.
     * @param sender Sender abstraction providing context (e.g., seqno, wallet info).
     * @param assets Optional list of assets attached to the transaction.
     * @returns Promise with the fee estimation and execution breakdown.
     */
    getTransactionSimulationInfo(
        evmProxyMsg: EvmProxyMsg,
        sender: SenderAbstraction,
        assets?: Asset[],
    ): Promise<ExecutionFeeEstimationResult>;
    /**
     * Suggests optimal TON-side executor fee for a given asset set and fee symbol.
     * @param assets Assets to be processed on TON side.
     * @param feeSymbol Symbol (ticker) to express the fee in.
     * @param tvmValidExecutors Optional whitelist of allowed TVM executors.
     * @returns Promise with suggested fee details.
     */
    getTVMExecutorFeeInfo(
        assets: Asset[],
        feeSymbol: string,
        tvmValidExecutors?: string[],
    ): Promise<SuggestedTONExecutorFee>;

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
        assets?: Asset[],
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
        txs: CrosschainTx[],
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
        assets?: Asset[],
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
    getNFTItemData(itemAddress: TVMAddress): Promise<NFTItemData>;

    // Address conversion methods
    getEVMTokenAddress(tvmTokenAddress: string): Promise<string>;
    getTVMTokenAddress(evmTokenAddress: string): Promise<string>;
    getTVMNFTAddress(evmNFTAddress: string, tokenId?: number | bigint): Promise<string>;
    getEVMNFTAddress(tvmNFTAddress: string, addressType: NFTAddressType): Promise<string>;

    // Utility methods
    isContractDeployedOnTVM(address: string): Promise<boolean>;
}
