/** Numbers must be safe integers. Use bigint for the full unsigned 64-bit range. */
export type SequenceInput = bigint | number;
/** Strings are UTF-8, never implicitly base64. */
export type BytesInput = string | Uint8Array;

export interface AppendRequest {
  /** Records sent in one request; string keys and values are UTF-8. */
  records: readonly { key: BytesInput; value: BytesInput }[];
  /** Default false matches the server. Set true for a durable acknowledgement. */
  awaitDurable?: boolean;
}

export interface AppendResponse {
  status: "success";
  recordsAppended: number;
  startSequence: bigint;
}

export interface ScanRequest {
  /** UTF-8 key identifying the log to read. */
  key: string;
  /** Inclusive global sequence. Default: 0. */
  startSequence?: SequenceInput;
  /** Exclusive global sequence. */
  endSequence?: SequenceInput;
  /** Server default: 32. */
  limit?: number;
  /** Wait for entries when the initial page is empty. Server default: false. */
  follow?: boolean;
  /** Server long-poll deadline in milliseconds; distinct from the HTTP deadline. Default: 30,000. */
  timeoutMs?: number;
}

export interface LogEntry<T = Uint8Array> {
  sequence: bigint;
  value: T;
}

export interface ScanResponse<T = Uint8Array> {
  status: "success";
  key: Uint8Array;
  values: LogEntry<T>[];
  /** Exclusive resume cursor. Optional for servers predating this field. */
  nextSequence?: bigint;
}

export interface CountRequest {
  /** UTF-8 key identifying the log to count. */
  key: string;
  /** Inclusive global sequence. Default: 0. */
  startSequence?: SequenceInput;
  /** Exclusive global sequence. Omit to count through the available entries. */
  endSequence?: SequenceInput;
}

export interface CountResponse {
  status: "success";
  count: bigint;
}
