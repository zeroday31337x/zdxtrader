export declare function redactHttp(value: unknown, depth?: number): unknown;
export declare function flushHttpLogs(): Promise<void>;
/** Request bodies and headers are deliberately excluded, including model context and credentials. */
export declare function loggedFetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
/** SDK transport returns parsed data, so success is labelled rather than inventing an HTTP status. */
export declare function loggedApiCall<T>(provider: string, method: string, route: string, operation: () => Promise<T>): Promise<T>;
