# Enhanced WaitOptions Examples

This document provides comprehensive examples of using the enhanced `WaitOptions` interface with custom callbacks for automatic profiling data retrieval and other advanced use cases.

## Overview

The `WaitOptions` interface provides powerful callback mechanisms that allow you to execute custom logic when operations succeed. The most common use case is the `onSuccess` callback, which executes automatically after a successful operation completion.

```typescript
interface WaitOptions<T = unknown, TContext = unknown> {
    timeout?: number;           // Timeout in milliseconds (default: 300000 - 5 minutes)
    maxAttempts?: number;       // Maximum number of attempts (default: 30)
    delay?: number;             // Delay between attempts in milliseconds (default: 10000 - 10 seconds)
    logger?: ILogger;           // Logger instance
    context?: TContext;         // Optional context object for additional parameters
    successCheck?: (result: T, context?: TContext) => boolean;  // Custom success validation
    onSuccess?: (result: T, context?: TContext) => Promise<void> | void;  // Success callback
    includeErrorTrace?: boolean; // Include error stack trace (default: false)
}
```

**Default Values:**
When `waitOptions` is not specified (undefined), the SDK uses default retry behavior:
- `timeout`: 300000ms (5 minutes) - from `DEFAULT_WAIT_TIMEOUT_MS`
- `maxAttempts`: 30 - from `DEFAULT_WAIT_MAX_ATTEMPTS`
- `delay`: 10000ms (10 seconds) - from `DEFAULT_WAIT_DELAY_MS`

**Disabling Retries:**
To disable retry behavior and use a single attempt, explicitly pass `null`:
```typescript
// Single attempt, no retries
await operationTracker.getOperationId(linker, null);

// Default retry behavior (30 attempts with 10s delay)
await operationTracker.getOperationId(linker);

// Custom retry behavior
await operationTracker.getOperationId(linker, { maxAttempts: 30, delay: 2000 });
```

## Basic onSuccess Example

```typescript
import { TacSdk, WaitOptions, Network, ConsoleLogger } from 'tac-sdk';

const basicWaitOptions: WaitOptions<string> = {
    timeout: 300000,
    maxAttempts: 30,
    delay: 10000,
    logger: new ConsoleLogger(),
    
    onSuccess: async (operationId: string) => {
        console.log(`✅ Operation completed successfully!`);
        console.log(`🔗 Operation ID: ${operationId}`);
        
        // You can perform any custom logic here
        // - Send notifications
        // - Update database
        // - Trigger other workflows
    }
};
```

## Advanced Profiling Example

This example demonstrates using the context parameter to pass an operationTracker from the SDK, avoiding the need to create a new instance inside the callback:

```typescript
import { TacSdk, WaitOptions, Network, ConsoleLogger, OperationType, OperationTracker } from 'tac-sdk';

// Define context interface for better type safety
interface ProfilingContext {
    operationTracker: OperationTracker;
    trackingConfig: {
        maxIterationCount: number;
        delay: number; // seconds
    };
}

const createManualTrackingWaitOptions = (
    operationTracker: OperationTracker, // Pass tracker from SDK
    logger: ConsoleLogger
): WaitOptions<string, ProfilingContext> => {
    
    // Create context with the operationTracker from SDK
    const context: ProfilingContext = {
        operationTracker: operationTracker, // Use the tracker passed from SDK
        trackingConfig: {
            maxIterationCount: 30,
            delay: 10 // seconds
        }
    };
    
    return {
        timeout: 300000,
        maxAttempts: 30,
        delay: 10000,
        logger: logger,
        context: context, // Pass context with operationTracker
        
        successCheck: (operationId: string, ctx?: ProfilingContext) => {
            const isValid = operationId && operationId.trim() !== '';
            if (isValid) {
                logger.info(`✓ Operation ID obtained: ${operationId}`);
            } else {
                logger.debug('Operation ID not yet available, retrying...');
            }
            return isValid;
        },
        
        onSuccess: async (operationId: string, ctx?: ProfilingContext) => {
            if (!ctx) {
                logger.error('Context not available in onSuccess callback');
                return;
            }
            
            try {
                logger.info('\n🔍 Starting manual operation finalization tracking...');
                
                // Use operationTracker from context (passed from SDK)
                const tracker = ctx.operationTracker;
                const maxIterationCount = ctx.trackingConfig.maxIterationCount;
                const delay = ctx.trackingConfig.delay;
                
                let iteration = 0; // number of iterations
                let operationType = '';
                let ok = true; // finished successfully
                let errorMessage: string = '';

                logger.debug(`Target operationId: ${operationId}`);

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
                            logger.info(`🎯 Operation finalized with status: ${operationType}`);
                            break;
                        }
                    } catch (err) {
                        logger.debug('failed to get operation type: ' + err);
                    }

                    logger.debug(`
                        operationId: ${operationId}
                        operationType: ${operationType}
                        time: ${new Date().toISOString()} (${Math.floor(+new Date() / 1000)})
                        iteration: ${iteration}/${maxIterationCount}
                    `);
                    
                    // Sleep for specified delay
                    await new Promise(resolve => setTimeout(resolve, delay * 1000));
                }

                logger.debug('Tracking finished');
                if (!ok) {
                    throw Error(errorMessage);
                }

                // Get profiling data after successful finalization using tracker from context
                logger.info('📊 Retrieving profiling data after finalization...');
                const profilingData = await tracker.getStageProfiling(operationId);

                // Display profiling results
                console.log('\n' + '='.repeat(60));
                console.log('📈 OPERATION FINALIZATION COMPLETE');
                console.log('='.repeat(60));
                console.log(`🔹 Operation ID: ${operationId}`);
                console.log(`🔹 Operation Type: ${operationType}`);
                console.log(`🔹 Total Iterations: ${iteration}`);
                console.log(`🔹 Profiling Data Retrieved: ${Object.keys(profilingData).length} stages`);
                
                // Show profiling stages summary
                for (const [stageName, stageInfo] of Object.entries(profilingData)) {
                    if (stageName !== 'operationType' && stageName !== 'metaInfo') {
                        console.log(`   • ${stageName}: ${stageInfo.exists ? '✅ Completed' : '⏸️  Not executed'}`);
                    }
                }
                console.log('='.repeat(60));
                
                logger.info('✅ Manual finalization tracking completed successfully!');
                
                return profilingData;

            } catch (finalizationError) {
                logger.error(`❌ Error during manual finalization tracking: ${finalizationError}`);
                throw finalizationError;
            }
        }
    };
};
```

### Complete Usage Example

Here's how to use the context-based manual tracking approach in a real transaction:

```typescript
async function sendTransactionWithManualTracking() {
    const logger = new ConsoleLogger();
    const network = Network.TESTNET;
    
    // Initialize SDK
    const tacSdk = await TacSdk.create({ network }, logger);
    
    // Get OperationTracker from SDK (instead of creating inside callback)
    const operationTracker = tacSdk.operationTracker;
    
    // Create sender and assets (setup code omitted for brevity)
    // ... sender and assets setup ...
    
    // Create enhanced wait options with manual tracking - pass operationTracker from SDK
    const manualTrackingOptions = createManualTrackingWaitOptions(operationTracker, logger);
    
    try {
        console.log('🚀 Sending transaction with context-based manual tracking...');
        console.log('⏳ Will wait for operation finalization before completing...');
        console.log('📋 Using operationTracker passed through context parameter...');
        
        // Send transaction - this will not complete until operation is finalized
        const operationId = await tacSdk.sendCrossChainTransaction(
            evmProxyMsg,
            sender, 
            assets,
            { allowSimulationError: true },
            manualTrackingOptions
        );
        
        console.log('\n🎉 Transaction and finalization tracking completed!');
        console.log(`📝 Final Operation ID: ${operationId}`);
        console.log('✅ OperationTracker was passed through context - no new instance created!');
        
        return operationId;
        
    } catch (error) {
        logger.error(`❌ Transaction or tracking failed: ${error}`);
        throw error;
    } finally {
        tacSdk.closeConnections();
    }
}

```

[Another example](../../tests/bridgeTONEnhanced.ts)