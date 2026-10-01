import type { Log } from "../client/index.js";
import { EventDecodingError, ProtocolError } from "../errors.js";
import { sequence } from "../protocol.js";
import { runRead } from "../shared.js";
import type { ScanResponse } from "../types/records.js";
import type { RequestOptions } from "../types/client.js";
import type { Codec, StreamScanRequest } from "../types/stream.js";

export function createScan<T>({
  client,
  key,
  codec,
}: {
  client: Pick<Log, "scan">;
  key: string;
  codec: Codec<T>;
}) {
  const keyBytes = new TextEncoder().encode(key);

  return function scan(
    input: StreamScanRequest = {},
    options?: RequestOptions,
  ): Promise<ScanResponse<T>> {
    return runRead("scan", async () => {
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
        response.key.some((byte, index) => byte !== keyBytes[index]);
      if (isDifferentKey) {
        throw new ProtocolError("Scan returned a different stream key");
      }
      const values = response.values.map((entry, index, entries) => {
        const previousSequence = entries[index - 1]?.sequence;
        const isOutOfOrder =
          previousSequence !== undefined && entry.sequence <= previousSequence;
        const isOutsideRange =
          entry.sequence < startSequence ||
          (endSequence !== undefined && entry.sequence >= endSequence);
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
      });
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
