import type { AppendOperation, ScanOperation } from "../client/types.js";
import type { RequestOptions } from "../types/client.js";
import type {
  AppendResponse,
  LogEntry,
  ScanResponse,
} from "../types/records.js";
import type {
  FollowRequest,
  StreamAppendRequest,
  StreamScanRequest,
} from "../types/stream.js";

export type StreamAppend<T> = (
  input: StreamAppendRequest<T>,
  options?: RequestOptions,
) => Promise<AppendResponse>;

export type StreamScan<T> = (
  input?: StreamScanRequest,
  options?: RequestOptions,
) => Promise<ScanResponse<T>>;

export type StreamFollow<T> = (
  input?: FollowRequest,
) => AsyncIterable<LogEntry<T>>;

export interface StreamClient {
  append: AppendOperation;
  scan: ScanOperation;
}

export interface FollowSource<T> {
  scan: StreamScan<T>;
}

export interface EncodedEvent {
  key: string;
  value: Uint8Array;
}

export interface SequenceRange {
  startSequence: bigint;
  endSequence: bigint | undefined;
}

export interface FollowSettings extends SequenceRange {
  limit: number;
  serverTimeoutMs: number;
  httpTimeoutMs: number;
  pollIntervalMs: number;
  signal: AbortSignal | undefined;
}
