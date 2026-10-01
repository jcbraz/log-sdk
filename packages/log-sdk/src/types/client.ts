export interface ClientOptions {
  /** Server origin or reverse-proxy prefix, without /api/v1/log. */
  baseURL: string;
  /** Headers sent with every request, including proxy authentication if required. */
  headers?: HeadersInit;
  /** Custom fetch implementation. Defaults to globalThis.fetch. */
  fetch?: typeof globalThis.fetch;
  /** Covers response headers and body. Default: 35,000 ms. */
  timeoutMs?: number;
}

export interface RequestOptions {
  /** Cancel the request, including response-body reading. */
  signal?: AbortSignal;
  /** Override the client's HTTP deadline in milliseconds, including the response body. */
  timeoutMs?: number;
}
