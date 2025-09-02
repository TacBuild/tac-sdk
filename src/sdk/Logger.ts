import { ILogger } from '../structs/Services';

export class ConsoleLogger implements ILogger {
    debug(...arg: unknown[]): void {
        console.debug(`[DEBUG]`, ...arg);
    }
    info(...arg: unknown[]): void {
        console.info(`[INFO]`, ...arg);
    }
    warn(...arg: unknown[]): void {
        console.warn(`[WARN]`, ...arg);
    }
    error(...arg: unknown[]): void {
        console.error(`[ERROR]`, ...arg);
    }
}

export class NoopLogger implements ILogger {
    debug(): void {}
    info(): void {}
    warn(): void {}
    error(): void {}
}
