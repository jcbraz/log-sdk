import { ProtocolError, ValidationError } from "../errors.js";
import {
  decodeCount,
  decodeKeys,
  decodeScan,
  decodeSegments,
} from "../protocol.js";
import { runRead } from "../shared.js";
import type {
  CountRequest,
  CountResponse,
  ScanRequest,
  ScanResponse,
} from "../types/records.js";
import type { ListKeysRequest, ListKeysResponse } from "../types/keys.js";
import type {
  ListSegmentsRequest,
  ListSegmentsResponse,
} from "../types/segments.js";
import type { RequestOptions } from "../types/client.js";
import type { Request } from "./request.js";
import { queryInteger, querySequence } from "./utils.js";

/** Never appended by the SDK; a scan of it reports only the log's observed end. */
const END_SEQUENCE_PROBE_KEY = "\u0000opendata-log-sdk/end-sequence-probe";

export function createReads(request: Request) {
  function requestScan(
    input: ScanRequest,
    options: RequestOptions | undefined,
  ): Promise<ScanResponse> {
    const isValidIncomingTextKey = typeof input.key === "string";
    if (!isValidIncomingTextKey)
      throw new ValidationError("Key must be a UTF-8 string.");

    return request({
      path: "api/v1/log/scan",
      query: {
        key: input.key,
        start_seq: querySequence(input.startSequence, "startSequence"),
        end_seq: querySequence(input.endSequence, "endSequence"),
        limit: queryInteger({ value: input.limit, field: "limit" }),
        follow: input.follow,
        timeout_ms: querySequence(input.timeoutMs, "timeoutMs"),
      },
      options,
      decode: decodeScan,
    });
  }

  return {
    scan(input: ScanRequest, options?: RequestOptions): Promise<ScanResponse> {
      return runRead("scan", () => requestScan(input, options));
    },

    endSequence(options?: RequestOptions): Promise<bigint> {
      return runRead("endSequence", async () => {
        // A drained scan lifts nextSequence to the log's frontier, even for a key with no records.
        const page = await requestScan(
          { key: END_SEQUENCE_PROBE_KEY, startSequence: 0n, limit: 1 },
          options,
        );
        const hasProbeRecords = page.values.length > 0;
        if (hasProbeRecords)
          throw new ProtocolError(
            "The end-sequence probe key has records; its scan cannot report the log's end",
          );
        const { nextSequence } = page;
        const hasFrontier = nextSequence !== undefined;
        if (!hasFrontier)
          throw new ProtocolError(
            "Scan response omitted nextSequence; endSequence requires OpenData Log 1.0.0 or later",
          );
        return nextSequence;
      });
    },

    listKeys(
      input: ListKeysRequest = {},
      options?: RequestOptions,
    ): Promise<ListKeysResponse> {
      return runRead("listKeys", () =>
        request({
          path: "api/v1/log/keys",
          query: {
            start_segment: queryInteger({
              value: input.startSegment,
              field: "startSegment",
              maximum: 0xffff_ffff,
            }),
            end_segment: queryInteger({
              value: input.endSegment,
              field: "endSegment",
              maximum: 0xffff_ffff,
            }),
            limit: queryInteger({ value: input.limit, field: "limit" }),
          },
          options,
          decode: decodeKeys,
        }),
      );
    },

    listSegments(
      input: ListSegmentsRequest = {},
      options?: RequestOptions,
    ): Promise<ListSegmentsResponse> {
      return runRead("listSegments", () =>
        request({
          path: "api/v1/log/segments",
          query: {
            start_seq: querySequence(input.startSequence, "startSequence"),
            end_seq: querySequence(input.endSequence, "endSequence"),
          },
          options,
          decode: decodeSegments,
        }),
      );
    },

    count(
      input: CountRequest,
      options?: RequestOptions,
    ): Promise<CountResponse> {
      return runRead("count", () => {
        const isTextKey = typeof input.key === "string";
        if (!isTextKey)
          throw new ValidationError(
            "key must be a UTF-8 string for GET requests",
          );
        return request({
          path: "api/v1/log/count",
          query: {
            key: input.key,
            start_seq: querySequence(input.startSequence, "startSequence"),
            end_seq: querySequence(input.endSequence, "endSequence"),
          },
          options,
          decode: decodeCount,
        });
      });
    },
  };
}
