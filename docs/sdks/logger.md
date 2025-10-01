# Logger Classes

## Table of Contents

- [Logger Classes](#logger-classes)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [ILogger Interface](#ilogger-interface)
  - [ConsoleLogger](#consolelogger)
    - [Creating an Instance](#creating-an-instance)
    - [Methods](#methods)
  - [NoopLogger](#nooplogger)
    - [Creating an Instance](#creating-an-instance)
    - [Methods](#methods)
  - [Example Usage](#example-usage)
    - [Integration with SDK Components](#integration-with-sdk-components)
    - [Best Practices](#best-practices)

---

## Overview

The SDK provides logging functionality through the `ILogger` interface and two implementations: `ConsoleLogger` and `NoopLogger`. By default, SDK components (e.g., TacSdk, OperationTracker, Simulator) use a no-op logger and are silent — they don’t write to the console unless you pass a logger explicitly. This allows flexible logging configuration across environments, enabling detailed debug output in development and quiet operation in production.

---

## ILogger Interface

```ts
interface ILogger {
  debug(...arg: unknown[]): void;
  info(...arg: unknown[]): void;
  warn(...arg: unknown[]): void;
  error(...arg: unknown[]): void;
}
```

The `ILogger` interface defines the contract for all logger implementations in the SDK. It provides four logging levels: debug, info, warn, and error.

**Methods:**
- `debug(...arg)`: Logs debug information
- `info(...arg)`: Logs informational messages
- `warn(...arg)`: Logs warning messages
- `error(...arg)`: Logs error messages

---

## ConsoleLogger

`ConsoleLogger` is a concrete implementation of `ILogger` that outputs log messages to the console with appropriate prefixes for each log level.

### Creating an Instance

```ts
new ConsoleLogger()
```

Creates a new ConsoleLogger instance that will output all log messages to the console.

### Methods

All methods in `ConsoleLogger` prefix the output with the appropriate log level and forward the arguments to the corresponding console method:

- **`debug(...arg)`**: Outputs `[DEBUG]` prefixed messages using `console.debug()`
- **`info(...arg)`**: Outputs `[INFO]` prefixed messages using `console.info()`
- **`warn(...arg)`**: Outputs `[WARN]` prefixed messages using `console.warn()`
- **`error(...arg)`**: Outputs `[ERROR]` prefixed messages using `console.error()`

**Example Output:**
```
[DEBUG] Aggregating tokens
[INFO] Transaction prepared successfully
[WARN] Gas estimation may be inaccurate
[ERROR] Simulation failed: insufficient balance
```

---

## NoopLogger

`NoopLogger` is a concrete implementation of `ILogger` that performs no operations when logging methods are called. This is useful for production environments where logging is not desired or when silent operation is needed.

### Creating an Instance

```ts
new NoopLogger()
```

Creates a new NoopLogger instance that will silently ignore all log messages.

### Methods

All methods in `NoopLogger` are no-operation functions that do nothing when called:

- **`debug(...arg)`**: No operation performed
- **`info(...arg)`**: No operation performed
- **`warn(...arg)`**: No operation performed
- **`error(...arg)`**: No operation performed

This implementation is useful for:
- Production environments where logging is not needed
- Performance-critical scenarios where logging overhead should be avoided
- Testing scenarios where log output should be suppressed

---

## Example Usage

```ts
import { ConsoleLogger, NoopLogger, Simulator, Configuration, Network } from "@tonappchain/sdk";
import { testnet } from "@tonappchain/artifacts";

// Create configuration
const config = await Configuration.create(Network.TESTNET, testnet);

// Use ConsoleLogger for development/debugging
const debugLogger = new ConsoleLogger();
const simulator = new Simulator(config, debugLogger);

// Use NoopLogger for production
const productionLogger = new NoopLogger();
const productionSimulator = new Simulator(config, productionLogger);

// Custom logger implementation
class CustomLogger implements ILogger {
  debug(...arg: unknown[]): void {
    // Custom debug logging logic
    console.log('[CUSTOM DEBUG]', ...arg);
  }
  
  info(...arg: unknown[]): void {
    // Custom info logging logic
    console.log('[CUSTOM INFO]', ...arg);
  }
  
  warn(...arg: unknown[]): void {
    // Custom warning logging logic
    console.log('[CUSTOM WARN]', ...arg);
  }
  
  error(...arg: unknown[]): void {
    // Custom error logging logic
    console.log('[CUSTOM ERROR]', ...arg);
  }
}

const customLogger = new CustomLogger();
const customSimulator = new Simulator(config, customLogger);
```

### Integration with SDK Components

Most SDK components accept an optional logger parameter:

```ts
// TacSdk with custom logger (SDK is silent by default if no logger is provided)
const sdk = await TacSdk.create({ network: Network.TESTNET }, new ConsoleLogger());

// Transaction Managers with console logger
const tonTransactionManager = new TONTransactionManager(
  config,
  simulator,
  operationTracker,
  new ConsoleLogger()
);

const tacTransactionManager = new TACTransactionManager(
  config,
  operationTracker,
  new ConsoleLogger()
);

// Simulator with no-op logger (silent)
const silentSimulator = new Simulator(config, new NoopLogger());
```

### Best Practices

1. **Development**: Use `ConsoleLogger` for detailed debugging and development
2. **Production**: Use `NoopLogger` or custom logger that writes to files/external services
3. **Testing**: Use `NoopLogger` to avoid cluttering test output
4. **Custom Logging**: Implement `ILogger` interface for integration with existing logging systems 