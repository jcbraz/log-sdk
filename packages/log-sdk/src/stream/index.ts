import type { Log } from "../client/index.js";
import { ValidationError } from "../errors.js";
import type { Codec } from "../types/stream.js";
import { createAppend } from "./append.js";
import { createScan } from "./scan.js";
import { createFollow } from "./follow.js";

/** A typed view of one UTF-8 key. Processing and checkpoint persistence remain caller-owned. */
export class LogStream<T> {
  /**
   * Encode and append a batch of events to this stream.
   * @param input - Event values and whether to wait for durable storage.
   * @param options - Caller abort signal and HTTP timeout override.
   * @returns The appended count and the batch's first global sequence.
   * @throws {AppendError} Encoding failures include an EventEncodingError with the batch index.
   */
  append;
  /**
   * Read and decode one page of events from this stream.
   * @param input - Inclusive start, exclusive end, page limit and long-poll settings.
   * @param options - Caller abort signal and HTTP timeout override.
   * @returns Decoded values, bigint sequences and an optional resume cursor.
   * @throws {ReadError} Decoding failures include an EventDecodingError with the sequence.
   */
  scan;
  /**
   * Yield decoded events, fetching each page only after the current page is consumed.
   * Save sequence + 1 after processing; resuming a checkpoint may replay work.
   * @param input - Sequence bounds, page size, poll deadlines and caller abort signal.
   * @returns A lazy async iterable that waits for new entries until cancelled or the end is reached.
   * @throws {ReadError} Identifies follow failures; cancellation has an AbortError cause.
   */
  follow;

  /**
   * Create a typed stream. Most callers should use Log.stream instead.
   * @param client - Client providing raw append and scan operations.
   * @param key - The UTF-8 key identifying the event stream.
   * @param codec - Encoder and decoder for the application event type.
   * @throws {ValidationError} The stream key is not a string.
   */
  constructor(
    client: Pick<Log, "append" | "scan">,
    readonly key: string,
    codec: Codec<T>,
  ) {
    const isTextKey = typeof key === "string";
    if (!isTextKey)
      throw new ValidationError("Stream key must be a UTF-8 string");

    this.append = createAppend({ client, key, codec });
    this.scan = createScan({ client, key, codec });
    this.follow = createFollow<T>(this);
  }
}
