import { jsonCodec } from "../codecs.js";
import type { Codec } from "../types/stream.js";
import { LogStream } from "../stream/index.js";
import type { ClientOptions } from "../types/client.js";
import { createAppend } from "./mutations.js";
import { createReads } from "./reads.js";
import { createRequest } from "./request.js";
import { createTelemetry } from "./telemetry.js";

/** TypeScript client for the OpenData Log HTTP API. */
export class Log {
  /**
   * Append a batch of records in one HTTP request.
   * @param input - Keys and values as UTF-8 strings or bytes, plus durability settings.
   * @param options - Caller abort signal and HTTP timeout override.
   * @returns The appended count and the batch's first global sequence.
   * @throws {AppendError} Includes the cause and whether the write outcome is unknown.
   */
  append;
  /**
   * Read a page of raw byte values for one UTF-8 key.
   * @param input - Key, inclusive start, exclusive end, page limit and long-poll settings.
   * @param options - Caller abort signal and HTTP timeout override.
   * @returns Byte values with bigint sequences and an optional resume cursor.
   * @throws {ReadError} Identifies the scan operation and its cause.
   */
  scan;
  /**
   * List distinct keys in a segment range. The API provides no continuation cursor.
   * @param input - Inclusive start segment, exclusive end segment and result limit.
   * @param options - Caller abort signal and HTTP timeout override.
   * @returns Sorted keys as bytes, truncated to the requested limit.
   * @throws {ReadError} Identifies the listKeys operation and its cause.
   */
  listKeys;
  /**
   * List segments overlapping a global sequence range.
   * @param input - Inclusive start and exclusive end sequence bounds.
   * @param options - Caller abort signal and HTTP timeout override.
   * @returns Segment IDs, starting sequences and creation timestamps.
   * @throws {ReadError} Identifies the listSegments operation and its cause.
   */
  listSegments;
  /**
   * Count entries for one UTF-8 key in a global sequence range.
   * @param input - Key, inclusive start sequence and exclusive end sequence.
   * @param options - Caller abort signal and HTTP timeout override.
   * @returns The exact entry count as a bigint.
   * @throws {ReadError} Identifies the count operation and its cause.
   */
  count;
  /**
   * Check server liveness.
   * @param options - Caller abort signal and HTTP timeout override.
   * @returns The server's health response text, normally "OK".
   * @throws {ReadError} Identifies the healthy operation and its cause.
   */
  healthy;
  /**
   * Check whether the server is ready to serve requests.
   * @param options - Caller abort signal and HTTP timeout override.
   * @returns The server's readiness response text, normally "OK".
   * @throws {ReadError} Includes an HTTP cause when the server is not ready.
   */
  ready;
  /**
   * Fetch the server's Prometheus metrics.
   * @param options - Caller abort signal and HTTP timeout override.
   * @returns Metrics in Prometheus text format.
   * @throws {ReadError} Identifies the metrics operation and its cause.
   */
  metrics;

  /**
   * Create a client for a server origin or reverse-proxy prefix.
   * @param options - Base URL, shared headers, fetch implementation and HTTP timeout.
   * @throws {ValidationError} The URL or timeout configuration is invalid.
   */
  constructor(options: ClientOptions) {
    const request = createRequest(options);
    const reads = createReads(request);
    const telemetry = createTelemetry(request);

    this.append = createAppend(request);
    this.scan = reads.scan;
    this.listKeys = reads.listKeys;
    this.listSegments = reads.listSegments;
    this.count = reads.count;
    this.healthy = telemetry.healthy;
    this.ready = telemetry.ready;
    this.metrics = telemetry.metrics;
  }

  /**
   * Bind typed append, scan and follow operations to one UTF-8 key.
   * @typeParam T - Application event type; a type argument alone does not validate data.
   * @param key - The UTF-8 key identifying the event stream.
   * @param codec - Event encoder and decoder. Defaults to UTF-8 JSON.
   * @returns A typed stream using this client's connection settings.
   * @throws {ValidationError} The stream key is not a string.
   */
  stream<T>(key: string, codec: Codec<T> = jsonCodec<T>()): LogStream<T> {
    return new LogStream(this, key, codec);
  }
}
