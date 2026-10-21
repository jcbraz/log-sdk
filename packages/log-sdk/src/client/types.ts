import type { RequestOptions } from "../types/client.js";
import type { ListKeysRequest, ListKeysResponse } from "../types/keys.js";
import type {
  AppendRequest,
  AppendResponse,
  CountRequest,
  CountResponse,
  ScanRequest,
  ScanResponse,
} from "../types/records.js";
import type {
  ListSegmentsRequest,
  ListSegmentsResponse,
} from "../types/segments.js";

export type AppendOperation = (
  input: AppendRequest,
  options?: RequestOptions,
) => Promise<AppendResponse>;

export type ScanOperation = (
  input: ScanRequest,
  options?: RequestOptions,
) => Promise<ScanResponse>;

export type ListKeysOperation = (
  input?: ListKeysRequest,
  options?: RequestOptions,
) => Promise<ListKeysResponse>;

export type ListSegmentsOperation = (
  input?: ListSegmentsRequest,
  options?: RequestOptions,
) => Promise<ListSegmentsResponse>;

export type CountOperation = (
  input: CountRequest,
  options?: RequestOptions,
) => Promise<CountResponse>;

export type TextOperation = (options?: RequestOptions) => Promise<string>;

export interface ReadOperations {
  scan: ScanOperation;
  listKeys: ListKeysOperation;
  listSegments: ListSegmentsOperation;
  count: CountOperation;
}

export interface TelemetryOperations {
  healthy: TextOperation;
  ready: TextOperation;
  metrics: TextOperation;
}

export interface EncodedRecord {
  key: string;
  value: string;
}

export interface RequestConfig {
  baseURL: URL;
  headers: Headers;
  fetch: typeof globalThis.fetch;
  timeoutMs: number;
}

export interface PreparedRequest {
  url: URL;
  init: RequestInit;
  method: string;
  expectsText: boolean;
  timeoutMs: number;
}
