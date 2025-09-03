export interface ILogger {
    debug(...arg: unknown[]): void;
    info(...arg: unknown[]): void;
    warn(...arg: unknown[]): void;
    error(...arg: unknown[]): void;
}
