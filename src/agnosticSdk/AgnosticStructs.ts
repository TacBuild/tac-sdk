/**
 * NFTData is a struct that contains the nft, id, and amount of the nft
 * @param nft - The address of the nft
 * @param id - The id of the nft
 * @param amount - The amount of the nft to transfer(for ERC1155, but currently supported only ERC721)
 */
export interface NFTData {
    nft: string;
    id: bigint;
    amount: bigint;
}

/**
 * BridgeData is a struct that contains the tokens, nfts, and isRequired of the bridge data
 * @param tokens - The addresses of the tokens to bridge
 * @param nfts - The nfts to bridge
 * @param isRequired - Whether the bridge is required
 */
export interface BridgeData {
    tokens: string[];
    nfts: NFTData[];
    isRequired: boolean;
}

/**
 * HookType is an enum that contains the type of the hook
 * @param Custom - The custom hook
 * @param FullBalanceApprove - The full balance approve hook
 * @param FullBalanceTransfer - The full balance transfer hook
 */
export enum HookType {
    Custom = 0,
    FullBalanceApprove = 1,
    FullBalanceTransfer = 2,
}

/**
 * ReplacementType is an enum that contains the type of the replacement
 * @param Amount - The amount replacement
 */
export enum ReplacementType {
    Amount = 0,
}

/**
 * AmountChange is a struct that contains the position, length, token, and balance address of the amount change
 * @param position - The position of the amount change(position of the parameter in the function call)
 * @param len - The length of the amount change(length of the parameter in the function call)
 * @param token - The token of the amount change
 * @param balanceAddress - The balance address of the amount change(address to check balance for)
 */
export interface AmountChange {
    position: number;
    len: number;
    token: string;
    balanceAddress: string;
}

/**
 * CustomHookData is a struct that contains the isFromSAPerspective, contractAddress, value, data, and improvedMissionInfo of the custom hook
 * @param isFromSAPerspective - Whether the hook is from the smart account perspective or from proxy perspective
 * @param contractAddress - The address of the contract to call
 * @param value - The value of the hook
 * @param data - The data of the hook
 * @param improvedMissionInfo - The improved mission info of the hook
 */
export interface CustomHookData {
    isFromSAPerspective: boolean;
    contractAddress: string;
    value: bigint;
    data: string;
    improvedMissionInfo: string;
}

/**
 * ApproveHookData is a struct that contains the token, to, and isFromSAPerspective of the approve hook
 * @param token - The token to approve
 * @param to - The address to approve to
 * @param isFromSAPerspective - Whether the hook is from the smart account perspective or from proxy perspective
 */
export interface ApproveHookData {
    token: string;
    to: string;
    isFromSAPerspective: boolean;
}

/**
 * TransferHookData is a struct that contains the token, to, and isFromSAPerspective of the transfer hook
 * @param token - The token to transfer
 * @param to - The address to transfer to
 * @param isFromSAPerspective - Whether the hook is from the smart account perspective or from proxy perspective
 */
export interface TransferHookData {
    token: string;
    to: string;
    isFromSAPerspective: boolean;
}

/**
 * Hook is a struct that contains the hookType and hookData of the hook
 * @param hookType - The type of the hook
 * @param hookData - The data of the hook
 */
export interface Hook {
    hookType: HookType;
    hookData: string; // ABI encoded data specific to the hook type
}

/**
 * ZapCall is a struct that contains the hooks and bridgeData of the zap call
 * @param hooks - The hooks of the zap call
 * @param bridgeData - The bridge data of the zap call
 */
export interface ZapCall {
    hooks: Hook[];
    bridgeData: BridgeData;
}
