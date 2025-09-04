export interface ILogger {
    /** Logs verbose diagnostic information useful during development. */
    debug(...arg: unknown[]): void;
    /** Logs general informational messages about normal operation. */
    info(...arg: unknown[]): void;
    /** Logs warnings about unexpected but non-fatal conditions. */
    warn(...arg: unknown[]): void;
    /** Logs errors for failures and exceptional conditions. */
    error(...arg: unknown[]): void;
}
