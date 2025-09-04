import { Address, toNano } from '@ton/ton';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';

import { simulationError } from '../errors';
import type { ISender } from '../sender';
import { SuggestedTONExecutorFeeResponse, TACSimulationResponse } from '../structs/InternalStruct';
import { IConfiguration, ILogger, ISimulator } from '../interfaces';
import {
    IAsset,
    CrosschainTx,
    EvmProxyMsg,
    ExecutionFeeEstimationResult,
    FeeParams,
    SuggestedTONExecutorFee,
    TACSimulationRequest,
    TACSimulationResult,
    TransactionLinker,
} from '../structs/Struct';
import { NoopLogger } from './Logger';
import {
    aggregateTokens,
    formatObjectForLogging,
    formatSolidityMethodName,
    generateTransactionLinker,
    toCamelCaseTransformer,
} from './Utils';
import { Validator } from './Validator';
import { IHttpClient } from '../interfaces';

export class AxiosHttpClient implements IHttpClient {
    async post<T>(url: string, data: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
        return axios.post<T>(url, data, config);
    }
}

export class Simulator implements ISimulator {
    private readonly config: IConfiguration;
    private readonly logger: ILogger;
    private readonly httpClient: IHttpClient;

    constructor(
        config: IConfiguration,
        logger: ILogger = new NoopLogger(),
        httpClient: IHttpClient = new AxiosHttpClient(),
    ) {
        this.config = config;
        this.logger = logger;
        this.httpClient = httpClient;
    }

    async simulateTACMessage(req: TACSimulationRequest): Promise<TACSimulationResult> {
        Validator.validateTACSimulationRequest(req);

        this.logger.debug('Simulating TAC message');
        let lastError;
        for (const endpoint of this.config.liteSequencerEndpoints) {
            try {
                const response = await this.httpClient.post<TACSimulationResponse>(
                    new URL('tac/simulator/simulate-message', endpoint).toString(),
                    req,
                    {
                        transformResponse: [toCamelCaseTransformer],
                    },
                );

                this.logger.debug('TAC message simulation success');
                return response.data.response;
            } catch (error) {
                this.logger.error(`Error while simulating with ${endpoint}: ${error}`);
                lastError = error;
            }
        }
        throw simulationError(lastError);
    }

    async simulateTransactions(sender: ISender, txs: CrosschainTx[]): Promise<TACSimulationResult[]> {
        this.logger.debug(`Simulating ${txs.length} TAC messages`);
        const results: TACSimulationResult[] = [];

        for (const tx of txs) {
            const req = await this.buildTACSimulationRequest(sender, tx);
            const result = await this.simulateTACMessage(req);
            results.push(result);
        }

        return results;
    }

    private async buildTACSimulationRequest(sender: ISender, tx: CrosschainTx): Promise<TACSimulationRequest> {
        const { evmProxyMsg, assets = [], options = {} } = tx;
        const {
            evmValidExecutors = this.config.TACParams.trustedTACExecutors,
            tvmValidExecutors = this.config.TACParams.trustedTONExecutors,
            calculateRollbackFee = true,
        } = options;

        Validator.validateEVMAddresses(evmValidExecutors);
        Validator.validateTVMAddresses(tvmValidExecutors);

        const aggregatedData = await aggregateTokens(assets);
        const transactionLinkerShardCount = aggregatedData.jettons.length == 0 ? 1 : aggregatedData.jettons.length;
        const transactionLinker = generateTransactionLinker(sender.getSenderAddress(), transactionLinkerShardCount);

        return {
            tacCallParams: {
                arguments: evmProxyMsg.encodedParameters ?? '0x',
                methodName: formatSolidityMethodName(evmProxyMsg.methodName),
                target: evmProxyMsg.evmTargetAddress,
            },
            evmValidExecutors: evmValidExecutors,
            tvmValidExecutors: tvmValidExecutors,
            extraData: '0x',
            shardsKey: transactionLinker.shardsKey,
            tonAssets: assets.map((asset) => ({
                amount: asset.rawAmount.toString(),
                tokenAddress: asset.address || '',
                assetType: asset.type,
            })),
            tonCaller: transactionLinker.caller,
            calculateRollbackFee: calculateRollbackFee,
        };
    }

    async getTVMExecutorFeeInfo(
        assets: IAsset[],
        feeSymbol: string,
        tvmValidExecutors: string[] = this.config.TACParams.trustedTONExecutors,
    ): Promise<SuggestedTONExecutorFee> {
        this.logger.debug('Getting TVM executor fee info');
        const requestBody = {
            tonAssets: assets.map((asset) => ({
                amount: asset.rawAmount.toString(),
                tokenAddress: asset.address || '',
                assetType: asset.type,
            })),
            feeSymbol: feeSymbol,
            tvmValidExecutors: tvmValidExecutors,
        };

        let lastError;
        for (const endpoint of this.config.liteSequencerEndpoints) {
            try {
                const response = await this.httpClient.post<SuggestedTONExecutorFeeResponse>(
                    `${endpoint}/ton/calculator/ton-executor-fee`,
                    requestBody,
                );

                return response.data.response;
            } catch (error) {
                this.logger.error(`Error while calculating tvm executor fee ${endpoint}: ${error}`);
                lastError = error;
            }
        }
        this.logger.error('Error while calculating tvm executor fee on all endpoints');
        throw simulationError(lastError);
    }

    private async getFeeInfo(
        evmProxyMsg: EvmProxyMsg,
        transactionLinker: TransactionLinker,
        assets: IAsset[],
        allowSimulationError: boolean = false,
        isRoundTrip: boolean = true,
        evmValidExecutors: string[] = this.config.TACParams.trustedTACExecutors,
        tvmValidExecutors: string[] = this.config.TACParams.trustedTONExecutors,
        calculateRollbackFee: boolean = true,
    ): Promise<ExecutionFeeEstimationResult> {
        this.logger.debug('Getting fee info');

        Validator.validateEVMAddress(evmProxyMsg.evmTargetAddress);
        Validator.validateEVMAddresses(evmValidExecutors);
        Validator.validateTVMAddresses(tvmValidExecutors);

        const crossChainLayer = this.config.TONParams.contractOpener.open(
            this.config.artifacts.ton.wrappers.CrossChainLayer.createFromAddress(
                Address.parse(this.config.TONParams.crossChainLayerAddress),
            ),
        );
        const fullStateCCL = await crossChainLayer.getFullData();
        this.logger.debug(`Full state CCL: ${formatObjectForLogging(fullStateCCL)}`);

        const tacSimulationBody: TACSimulationRequest = {
            tacCallParams: {
                arguments: evmProxyMsg.encodedParameters ?? '0x',
                methodName: formatSolidityMethodName(evmProxyMsg.methodName),
                target: evmProxyMsg.evmTargetAddress,
            },
            evmValidExecutors: evmValidExecutors,
            tvmValidExecutors: tvmValidExecutors,
            extraData: '0x',
            shardsKey: transactionLinker.shardsKey,
            tonAssets: assets.map((asset) => ({
                amount: asset.rawAmount.toString(),
                tokenAddress: asset.address || '',
                assetType: asset.type,
            })),
            tonCaller: transactionLinker.caller,
            calculateRollbackFee: calculateRollbackFee,
        };

        isRoundTrip = isRoundTrip ?? assets.length != 0;
        this.logger.debug(`Is round trip: ${isRoundTrip}`);

        const tacSimulationResult = await this.simulateTACMessage(tacSimulationBody);
        this.logger.debug(`TAC simulation ${tacSimulationResult.simulationStatus ? 'success' : 'failed'}`);

        const protocolFee =
            BigInt(toNano(fullStateCCL.tacProtocolFee!)) +
            BigInt(isRoundTrip) * BigInt(toNano(fullStateCCL.tonProtocolFee!));

        const feeParams: FeeParams = {
            isRoundTrip: isRoundTrip,
            gasLimit: !tacSimulationResult.simulationStatus ? 0n : tacSimulationResult.estimatedGas,
            protocolFee: protocolFee,
            evmExecutorFee: BigInt(tacSimulationResult.suggestedTacExecutionFee),
            tvmExecutorFee: BigInt(tacSimulationResult.suggestedTonExecutionFee) * BigInt(isRoundTrip),
        };

        if (!tacSimulationResult.simulationStatus) {
            if (allowSimulationError) {
                this.logger.info('Force send is true, returning fee params');
                return {
                    feeParams,
                    simulation: tacSimulationResult,
                };
            }
            throw tacSimulationResult;
        }

        this.logger.debug(`Collected fee params: ${formatObjectForLogging(feeParams)}`);
        return { feeParams, simulation: tacSimulationResult };
    }

    async getTransactionSimulationInfo(
        evmProxyMsg: EvmProxyMsg,
        sender: ISender,
        assets?: IAsset[],
    ): Promise<ExecutionFeeEstimationResult> {
        this.logger.debug('Getting transaction simulation info');

        Validator.validateEVMAddress(evmProxyMsg.evmTargetAddress);

        const aggregatedData = await aggregateTokens(assets);
        const transactionLinkerShardCount = aggregatedData.jettons.length == 0 ? 1 : aggregatedData.jettons.length;
        this.logger.debug(`Transaction linker shard count: ${transactionLinkerShardCount}`);

        const transactionLinker = generateTransactionLinker(sender.getSenderAddress(), transactionLinkerShardCount);
        this.logger.debug(`Transaction linker: ${formatObjectForLogging(transactionLinker)}`);

        return await this.getFeeInfo(evmProxyMsg, transactionLinker, assets ?? []);
    }

    async getSimulationInfoForTransaction(
        evmProxyMsg: EvmProxyMsg,
        transactionLinker: TransactionLinker,
        assets: IAsset[],
        allowSimulationError: boolean = false,
        isRoundTrip?: boolean,
        evmValidExecutors?: string[],
        tvmValidExecutors?: string[],
        calculateRollbackFee?: boolean,
    ): Promise<ExecutionFeeEstimationResult> {
        return await this.getFeeInfo(
            evmProxyMsg,
            transactionLinker,
            assets,
            allowSimulationError,
            isRoundTrip,
            evmValidExecutors,
            tvmValidExecutors,
            calculateRollbackFee,
        );
    }
}
