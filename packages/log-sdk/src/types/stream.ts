import type { SequenceInput } from "./records.js";

/** Encode and decode application values as the opaque bytes stored by OpenData Log. */
export interface Codec<T> {
  /**
   * Encode one application value for storage.
   * @param value - The event to encode.
   * @returns Opaque bytes; the client handles base64 for HTTP separately.
   */
  encode: (value: T) => Uint8Array;
  /**
   * Decode one stored event, validating its shape when required.
   * @param bytes - The stored bytes after HTTP base64 decoding.
   * @returns The decoded application value.
   */
  decode: (bytes: Uint8Array) => T;
}

export interface StreamAppendRequest<T> {
  /** Events sent together in one request, in array order. */
  values: readonly T[];
  /** Wait for durable storage before acknowledgement. Default: false. */
  awaitDurable?: boolean;
}

export interface StreamScanRequest {
  /** Inclusive global sequence. Default: 0. */
  startSequence?: SequenceInput;
  /** Exclusive global sequence. Omit to read through the available entries. */
  endSequence?: SequenceInput;
  /** Maximum entries in this page. Server default: 32; use a positive integer. */
  limit?: number;
  /** Wait for entries when the initial page is empty. Server default: false. */
  follow?: boolean;
  /** Server long-poll deadline in milliseconds. Server default: 30,000. */
  timeoutMs?: number;
}

export interface FollowRequest {
  /** Inclusive starting position or persisted next-position checkpoint. Default: 0. */
  startSequence?: SequenceInput;
  /** Exclusive stopping position. Omit to keep following until cancelled. */
  endSequence?: SequenceInput;
  /** Page size. Default: 100. */
  limit?: number;
  /** Server long-poll deadline. Default: 30,000 ms. */
  timeoutMs?: number;
  /** Cancel the outstanding request or idle wait. */
  signal?: AbortSignal;
  /** Minimum idle poll interval for older servers. Default: 100 ms. */
  pollIntervalMs?: number;
}
