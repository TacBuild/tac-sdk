import 'dotenv/config';

import {
    EvmProxyMsg,
    IOperationTracker,
    Network,
    OperationType,
    SDKParams,
    SenderFactory,
    TacSdk,
    WaitOptions,
} from '../src';
import { ConsoleLogger } from '../src';
import { MAX_ITERATION_COUNT } from '../src/sdk/Consts';
import { sleep } from '../src/sdk/Utils';

interface TransactionContext {
    operationTracker: IOperationTracker;
}

const createEnhancedWaitOptions = (
    operationTracker: IOperationTracker,
    logger: ConsoleLogger,
): WaitOptions<string,unknown> => {
    const context: TransactionContext = {
        operationTracker: operationTracker,
    };

    return {
        logger: logger,
        context: context,
        successCheck: (operationId: string) => !!operationId,
        onSuccess: async (operationId: string, ctx?: unknown) => {
            const transactionCtx = ctx as TransactionContext;
            if (!transactionCtx) {
                logger.error('❌ Context not available in onSuccess callback');
                return;
            }

            try {
                logger.debug('🔍 Starting enhanced operation finalization tracking...');

                const tracker = transactionCtx.operationTracker;
                const maxIterationCount = MAX_ITERATION_COUNT;
                const delay = 10;

                let iteration = 0; // number of iterations
                let operationType = '';
                let ok = true; // finished successfully
                let errorMessage: string = '';

                logger.debug(`🎯 Target Operation ID: ${operationId}`);
                logger.debug('🔄 Starting manual operation finalization tracking...');
                logger.debug(`⚙️  Max iterations: ${maxIterationCount}, Delay: ${delay}s`);

                while (true) {
                    ++iteration;
                    if (iteration >= maxIterationCount) {
                        ok = false;
                        errorMessage = 'maximum number of iterations has been exceeded';
                        break;
                    }

                    try {
                        operationType = await tracker.getOperationType(operationId);
                        if (operationType != OperationType.PENDING && operationType != OperationType.UNKNOWN) {
                            break;
                        }
                    } catch (err) {
                        logger.debug('failed to get operation type: ' + err);
                    }

                    logger.debug(`operationType: ${operationType} iteration: ${iteration}/${maxIterationCount}`);
                    await sleep(delay * 1000);
                }

                logger.debug('Tracking finished');
                if (!ok) {
                    throw Error(errorMessage);
                }

                logger.debug('📊 Retrieving profiling data after finalization...');
                const profilingData = await tracker.getStageProfiling(operationId);

                // Display profiling results
                logger.debug('='.repeat(60));
                logger.debug('📈 OPERATION FINALIZATION COMPLETE');
                logger.debug('='.repeat(60));
                logger.debug(`🔹 Operation ID: ${operationId}`);
                logger.debug(`🔹 Operation Type: ${operationType}`);
                logger.debug(`🔹 Total Iterations: ${iteration}`);
                logger.debug(`🔹 Profiling Data Retrieved:`);

                // Show profiling stages summary
                for (const [stageName, stageInfo] of Object.entries(profilingData)) {
                    if (stageName !== 'operationType' && stageName !== 'metaInfo') {
                        const isProfilingStage = stageInfo && typeof stageInfo === 'object' && 'exists' in stageInfo;
                        if (isProfilingStage && stageInfo.exists) {
                            logger.debug(`   • ${stageName}: ✅ Completed`);
                        }
                    }
                }
                logger.debug('='.repeat(60));

                logger.debug('✅ Manual finalization tracking completed successfully!');

                return;
            } catch (finalizationError) {
                logger.error(`❌ Error during enhanced finalization tracking: ${finalizationError}`);
                logger.debug(
                    '\nℹ️  Note: The transaction was successful, but finalization tracking encountered an error.',
                );
                throw finalizationError;
            }
        },
    };
};

const bridgeTonSawSender = async (amount: number) => {
    // create TacSdk
    const sdkParams: SDKParams = {
        network: Network.TESTNET,
    };
    const logger = new ConsoleLogger();
    const tacSdk = await TacSdk.create(sdkParams, logger);

    // create evm proxy msg
    const evmProxyMsg: EvmProxyMsg = {
        evmTargetAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    };

    // create sender abstraction
    const mnemonic = process.env.TVM_MNEMONICS || ''; // 24 words mnemonic
    const sender = await SenderFactory.getSender({
        network: Network.TESTNET,
        version: 'V3R2',
        mnemonic,
    });

    // create JettonTransferData (transfer jetton in TVM to swap)
    const assets = [
        { address: tacSdk.config.nativeTONAddress, amount: amount },
        { address: tacSdk.config.nativeTONAddress, amount: amount },
        { address: tacSdk.config.nativeTONAddress, amount: amount },
    ];

    const manualTrackingOptions = createEnhancedWaitOptions(tacSdk.operationTracker, logger);

    const result = await tacSdk.sendCrossChainTransaction(
        evmProxyMsg,
        sender,
        assets,
        { allowSimulationError: true },
        manualTrackingOptions,
    );

    tacSdk.closeConnections();

    return result;
};

async function main() {
    try {
        // send transaction
        await bridgeTonSawSender(0.0012);
    } catch (error) {
        console.error('Error during transaction:', error);
    }

    return;
}

main().catch((error) => console.error('Fatal error:', error));
