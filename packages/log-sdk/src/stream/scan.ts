import { EventDecodingError, ProtocolError } from "../errors.js";
import { sequence } from "../protocol.js";
import { runRead } from "../shared.js";
import type { RequestOptions } from "../types/client.js";
import type { LogEntry, ScanResponse } from "../types/records.js";
import type { Codec, StreamScanRequest } from "../types/stream.js";
import type { SequenceRange, StreamClient, StreamScan } from "./types.js";

export function createScan<T>({
  client,
  key,
  codec,
}: {
  client: StreamClient;
  key: string;
  codec: Codec<T>;
}): StreamScan<T> {
  const keyBytes = new TextEncoder().encode(key);

  return function scan(
    input: StreamScanRequest = {},
    options?: RequestOptions,
  ): Promise<ScanResponse<T>> {
    return runRead("scan", async (): Promise<ScanResponse<T>> => {
      const startSequence = sequence(
        input.startSequence ?? 0n,
        "startSequence",
      );
      const endSequence =
        input.endSequence === undefined
          ? undefined
          : sequence(input.endSequence, "endSequence");
      const response = await client.scan({ ...input, key }, options);
      const isDifferentKey =
        response.key.length !== keyBytes.length ||
        response.key.some((byte, index): boolean => byte !== keyBytes[index]);
      if (isDifferentKey) {
        throw new ProtocolError("Scan returned a different stream key");
      }
      const values = response.values.map(
        (entry, index, entries): LogEntry<T> =>
          decodeEntry({
            entry,
            previousSequence: entries[index - 1]?.sequence,
            range: { startSequence, endSequence },
            codec,
          }),
      );
      const lastSequence = response.values.at(-1)?.sequence;
      const minimumCursor =
        lastSequence === undefined ? startSequence : lastSequence + 1n;
      const isCursorBehindEntries =
        response.nextSequence !== undefined &&
        response.nextSequence < minimumCursor;
      if (isCursorBehindEntries) {
        throw new ProtocolError(
          "Scan returned a non-advancing sequence cursor",
        );
      }
      return { ...response, values };
    });
  };
}

function decodeEntry<T>({
  entry,
  previousSequence,
  range,
  codec,
}: {
  entry: LogEntry;
  previousSequence: bigint | undefined;
  range: SequenceRange;
  codec: Codec<T>;
}): LogEntry<T> {
  const isOutOfOrder =
    previousSequence !== undefined && entry.sequence <= previousSequence;
  const isBeforeRange = entry.sequence < range.startSequence;
  const isAfterRange =
    range.endSequence !== undefined && entry.sequence >= range.endSequence;
  const isOutsideRange = isBeforeRange || isAfterRange;
  const hasInvalidSequence = isOutOfOrder || isOutsideRange;
  if (hasInvalidSequence) {
    throw new ProtocolError(
      "Scan returned an out-of-order or out-of-range entry",
    );
  }
  try {
    return {
      sequence: entry.sequence,
      value: codec.decode(entry.value),
    };
  } catch (cause) {
    throw new EventDecodingError({ sequence: entry.sequence, cause });
  }
}
