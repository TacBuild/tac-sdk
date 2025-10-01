import { AGNOSTIC_PROXY_ADDRESS as MAINNET_AGNOSTIC_PROXY_ADDRESS } from '../../artifacts/mainnet';
import { AGNOSTIC_PROXY_ADDRESS as TESTNET_AGNOSTIC_PROXY_ADDRESS } from '../../artifacts/testnet';
import { Network } from '../structs/Struct';
import { AbiHandler } from './AbiHandler';
import { AmountChange, Hook, NFTData, ZapCall } from './AgnosticStructs';
import { DebugHelpers } from './DebugHelpers';
import { HooksHandler } from './HooksHandler';
import { ReplacementHelper } from './ReplacementHelper';

/**
 * SDK for building AgnosticProxy Zap calls with efficient hook encoding
 * @param network - The network to use (MAINNET || TESTNET || DEV)
 * @param agnosticProxyAddress - The address of the agnostic proxy(optional)
 */
export class AgnosticProxySDK {
    private agnosticProxyAddress: string;
    private abiHandler: AbiHandler;
    private replacementHelper: ReplacementHelper;
    private hooksHandler: HooksHandler;
    private debugHelpers: DebugHelpers;

    constructor(network: Network, agnosticProxyAddress?: string) {
        switch (network) {
            case Network.MAINNET:
                this.agnosticProxyAddress = agnosticProxyAddress ?? MAINNET_AGNOSTIC_PROXY_ADDRESS;
                break;
            case Network.TESTNET:
                this.agnosticProxyAddress = agnosticProxyAddress ?? TESTNET_AGNOSTIC_PROXY_ADDRESS;
                break;
            case Network.DEV:
                if (!agnosticProxyAddress) {
                    throw new Error('Agnostic proxy address is required for dev network');
                }
                this.agnosticProxyAddress = agnosticProxyAddress;
                break;
        }
        this.abiHandler = new AbiHandler();
        this.replacementHelper = new ReplacementHelper();
        this.hooksHandler = new HooksHandler();
        this.debugHelpers = new DebugHelpers();
    }

    public addContractInterface(address: string, abi: string | any[]): this {
        this.abiHandler.addContractInterface(address, abi);
        return this;
    }

    /**
     * Create a custom hook with optional dynamic value replacement
     * @param contractAddress - The address of the contract to call
     * @param functionName - The name of the function to call
     * @param params - The parameters of the function to call
     * @param options - The options of the custom hook
     * @returns The custom hook
     */
    public createCustomHook(
        contractAddress: string,
        functionName: string,
        params: any[],
        options: {
            isFromSAPerspective?: boolean;
            value?: bigint;
            dynamicReplacements?: AmountChange[];
        } = {},
    ): Hook {
        return this.hooksHandler.createCustomHook(
            contractAddress,
            functionName,
            params,
            this.abiHandler.contractInterfaces,
            options,
        );
    }

    /**
     * Create a full balance approve hook
     * @param token - The token to approve
     * @param to - The address to approve to
     * @param isFromSAPerspective - Whether the hook is from the smart account perspective or from proxy perspective
     * @returns The full balance approve hook
     */
    public createFullBalanceApproveHook(token: string, to: string, isFromSAPerspective: boolean = true): Hook {
        return this.hooksHandler.createFullBalanceApproveHook(token, to, isFromSAPerspective);
    }

    /**
     * Create a full balance transfer hook
     * @param token - The token to transfer
     * @param to - The address to transfer to
     * @param isFromSAPerspective - Whether the hook is from the smart account perspective or from proxy perspective
     * @returns The full balance transfer hook
     */
    public createFullBalanceTransferHook(token: string, to: string, isFromSAPerspective: boolean = true): Hook {
        return this.hooksHandler.createFullBalanceTransferHook(token, to, isFromSAPerspective);
    }

    /**
     * Utility: Create multiple approve hooks at once
     * @param approvals - The approvals to create
     * @returns The multiple approve hooks
     */
    public createMultipleApproves(approvals: { token: string; spender: string; isFromSA?: boolean }[]): Hook[] {
        return this.hooksHandler.createMultipleApproves(approvals);
    }

    /**
     * Utility: Create a sequence of custom hooks
     * @param calls - The calls to create
     * @returns The hook sequence
     */
    public createHookSequence(
        calls: {
            contract: string;
            functionName: string;
            params: any[];
            options?: {
                isFromSAPerspective?: boolean;
                value?: bigint;
                dynamicReplacements?: AmountChange[];
            };
        }[],
    ): Hook[] {
        return calls.map((call) => this.createCustomHook(call.contract, call.functionName, call.params, call.options));
    }

    /**
     * Helper to create dynamic amount replacement for a specific parameter
     * @param paramIndex - The index of the parameter to replace
     * @param token - The token to replace
     * @param balanceAddress - The address to replace the parameter with
     * @returns The amount replacement
     */
    public createAmountReplacement(paramIndex: number, token: string, balanceAddress: string): AmountChange {
        return this.replacementHelper.createAmountReplacement(paramIndex, token, balanceAddress);
    }

    /**
     * Advanced replacement calculator - calculates position and length for any parameter type
     * Required that you have added the contract interface first using addContractInterface().
     * If human readable abi is used, need to provide function and params names also
     * @param contractAddress - The address of the contract to call
     * @param functionName - The name of the function to call
     * @param parameterName - The name of the parameter to replace
     * @param token - The token to replace
     * @param balanceAddress - The address to replace the parameter with
     * @returns The replacement data
     */
    public calculateReplacementData(
        contractAddress: string,
        functionName: string,
        parameterName: string,
        token: string,
        balanceAddress: string,
    ): AmountChange {
        return this.replacementHelper.calculateReplacementData(
            contractAddress,
            functionName,
            parameterName,
            token,
            balanceAddress,
            this.abiHandler.contractInterfaces,
        );
    }

    /**
     * Get replacement helper - shows available functions and parameters for a contract
     * Required that you have added the contract interface first using addContractInterface().
     * If human readable abi is used, need to provide function and params names also
     * @param contractAddress - The address of the contract to call
     * @returns The replacement helper
     */
    public getReplacementHelper(contractAddress: string): {
        contractAddress: string;
        functions: {
            name: string;
            signature: string;
            parameters: {
                name: string;
                type: string;
                index: number;
                canReplace: boolean;
                reason?: string;
            }[];
        }[];
    } {
        return this.replacementHelper.getReplacementHelper(contractAddress, this.abiHandler.contractInterfaces);
    }

    /**
     * Interactive replacement builder - helps build replacement step by step
     * @param contractAddress - The address of the contract to call
     * @param functionName - The name of the function to call
     * @param parameterName - The name of the parameter to replace
     * @param token - The token to replace
     * @param balanceAddress - The address to replace the parameter with
     * @param options - The options of the interactive replacement builder
     * @returns The interactive replacement builder
     */
    public buildReplacementInteractive(
        contractAddress: string,
        functionName: string,
        parameterName: string,
        token: string,
        balanceAddress: string,
        options: {
            showCalculation?: boolean;
            validate?: boolean;
        } = {},
    ): {
        replacement: AmountChange;
        calculation: {
            functionSignature: string;
            parameterInfo: {
                name: string;
                type: string;
                index: number;
                position: number;
                length: number;
            };
            positionCalculation: string;
        };
        validation: {
            isValid: boolean;
            warnings: string[];
            suggestions: string[];
        };
    } {
        return this.replacementHelper.buildReplacementInteractive(
            contractAddress,
            functionName,
            parameterName,
            token,
            balanceAddress,
            this.abiHandler.contractInterfaces,
            options,
        );
    }

    /**
     * Debug helper: Decode hook data back to readable format
     * @param hook - The hook to decode
     * @returns The decoded hook
     */
    public decodeHookData(hook: Hook): any {
        return this.debugHelpers.decodeHookData(hook);
    }

    /**
     * Debug helper: Get estimated gas for a ZapCall
     * @param zapCall - The zap call to estimate the gas usage for
     * @returns The estimated gas usage
     */
    public estimateGasUsage(zapCall: ZapCall): number {
        return this.debugHelpers.estimateGasUsage(zapCall);
    }

    /**
     * Visualize ZapCall chain - Human readable description of all operations
     * @param zapCall - The zap call to visualize
     */
    public visualizeZapCall(zapCall: ZapCall): void {
        return this.debugHelpers.visualizeZapCall(zapCall, this.abiHandler.contractInterfaces);
    }
    /**
     * Get a detailed breakdown of a ZapCall for logging
     * @param zapCall - The zap call to get the breakdown for
     * @returns The breakdown of the zap call
     */
    public getZapCallBreakdown(zapCall: ZapCall): {
        totalHooks: number;
        hookTypes: { [key: string]: number };
        gasEstimate: number;
        encodedSize: number;
        bridgeRequired: boolean;
        hookDescriptions: string[];
    } {
        return this.debugHelpers.getZapCallBreakdown(zapCall, this.abiHandler.contractInterfaces);
    }

    /**
     * Compare two ZapCalls and show differences
     * @param zapCall1 - The first zap call to compare
     * @param zapCall2 - The second zap call to compare
     * @param label1 - The label of the first zap call
     * @param label2 - The label of the second zap call
     */
    public compareZapCalls(
        zapCall1: ZapCall,
        zapCall2: ZapCall,
        label1: string = 'ZapCall 1',
        label2: string = 'ZapCall 2',
    ): void {
        return this.debugHelpers.compareZapCalls(
            zapCall1,
            zapCall2,
            label1,
            label2,
            this.abiHandler.contractInterfaces,
        );
    }

    getAgnosticCallParams(): { evmTargetAddress: string; methodName: string } {
        return {
            evmTargetAddress: this.agnosticProxyAddress,
            methodName: 'Zap(bytes,bytes)',
        };
    }

    /**
     * Build a complete ZapCall
     * @param hooks - The hooks of the zap call
     * @param bridgeTokens - The tokens to bridge
     * @param bridgeNFTs - The nfts to bridge
     * @returns The zap call
     */
    public buildZapCall(hooks: Hook[], bridgeTokens: string[] = [], bridgeNFTs: NFTData[] = []): ZapCall {
        return this.debugHelpers.buildZapCall(hooks, bridgeTokens, bridgeNFTs);
    }

    /**
     * Encode ZapCall for transaction
     * @param zapCall - The zap call to encode
     * @returns The encoded zap call that can be used as calldata in tac sdk
     */
    public encodeZapCall(zapCall: ZapCall): string {
        return this.debugHelpers.encodeZapCall(zapCall);
    }
}
