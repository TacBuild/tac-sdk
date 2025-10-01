import { ILogger } from '../interfaces';

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
    debug(..._arg: unknown[]): void {
        void _arg;
    }
    info(..._arg: unknown[]): void {
        void _arg;
    }
    warn(..._arg: unknown[]): void {
        void _arg;
    }
    error(..._arg: unknown[]): void {
        void _arg;
    }
}
