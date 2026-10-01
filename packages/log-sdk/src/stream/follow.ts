import { AbortError, ReadError, ValidationError } from "../errors.js";
import { sequence } from "../protocol.js";
import type { RequestOptions } from "../types/client.js";
import type { LogEntry } from "../types/records.js";
import type { FollowRequest, StreamScanRequest } from "../types/stream.js";
import type { LogStream } from "./index.js";

const MAX_TIMER_MS = 2_147_483_647;

export function createFollow<T>(stream: Pick<LogStream<T>, "scan">) {
  return async function* follow(
    input: FollowRequest = {},
  ): AsyncIterable<LogEntry<T>> {
    try {
      const {
        startSequence,
        endSequence,
        limit,
        serverTimeoutMs,
        httpTimeoutMs,
        pollIntervalMs,
        signal,
      } = followSettings(input);
      const scanRequest: StreamScanRequest = {
        limit,
        follow: true,
        timeoutMs: serverTimeoutMs,
      };
      if (endSequence !== undefined) scanRequest.endSequence = endSequence;

      const requestOptions: RequestOptions = { timeoutMs: httpTimeoutMs };
      if (signal !== undefined) requestOptions.signal = signal;

      let nextSequence = startSequence;
      while (endSequence === undefined || nextSequence < endSequence) {
        if (signal?.aborted) {
          throw new AbortError("Follow aborted", {
            cause: signal.reason,
          });
        }
        const startedAt = performance.now();
        const page = await stream.scan(
          { ...scanRequest, startSequence: nextSequence },
          requestOptions,
        );

        const lastEntry = page.values.at(-1);
        const nextPageSequence =
          page.nextSequence ??
          (lastEntry ? lastEntry.sequence + 1n : nextSequence);

        // Yield the current page before requesting another one: consumers control backpressure.
        for (const entry of page.values) {
          if (signal?.aborted) {
            throw new AbortError("Follow aborted", {
              cause: signal.reason,
            });
          }
          yield entry;
        }
        nextSequence = nextPageSequence;
        const isRangeComplete =
          endSequence !== undefined && nextSequence >= endSequence;
        if (isRangeComplete) return;

        const isEmptyPage = page.values.length === 0;
        if (!isEmptyPage) continue;
        const pollElapsedMs = performance.now() - startedAt;
        const waitMs = pollIntervalMs - pollElapsedMs;
        if (waitMs > 0) await waitForNextPoll(waitMs, signal);
      }
    } catch (cause) {
      throw new ReadError({ operation: "follow", cause });
    }
  };
}

function followSettings(input: FollowRequest) {
  const startSequence = sequence(input.startSequence ?? 0n, "startSequence");
  const endSequence =
    input.endSequence === undefined
      ? undefined
      : sequence(input.endSequence, "endSequence");
  const isRangeReversed =
    endSequence !== undefined && endSequence < startSequence;
  if (isRangeReversed) {
    throw new ValidationError(
      "endSequence must be greater than or equal to startSequence",
    );
  }

  const limit = input.limit ?? 100;
  const isLimitValid = Number.isSafeInteger(limit) && limit >= 1;
  if (!isLimitValid) {
    throw new ValidationError("limit must be a positive safe integer");
  }

  // Leave time for the server's long poll to finish before the HTTP deadline.
  const httpTimeoutMarginMs = 5_000;
  const serverTimeoutMs = input.timeoutMs ?? 30_000;
  const maximumPollTimeout = MAX_TIMER_MS - httpTimeoutMarginMs;
  const isServerTimeoutValid =
    Number.isSafeInteger(serverTimeoutMs) &&
    serverTimeoutMs >= 0 &&
    serverTimeoutMs <= maximumPollTimeout;
  if (!isServerTimeoutValid) {
    throw new ValidationError(
      `timeoutMs must be an integer between 0 and ${maximumPollTimeout}`,
    );
  }

  const pollIntervalMs = input.pollIntervalMs ?? 100;
  const isPollIntervalValid =
    Number.isSafeInteger(pollIntervalMs) &&
    pollIntervalMs >= 1 &&
    pollIntervalMs <= MAX_TIMER_MS;
  if (!isPollIntervalValid) {
    throw new ValidationError(
      `pollIntervalMs must be an integer between 1 and ${MAX_TIMER_MS}`,
    );
  }

  return {
    startSequence,
    endSequence,
    limit,
    serverTimeoutMs,
    httpTimeoutMs: serverTimeoutMs + httpTimeoutMarginMs,
    pollIntervalMs,
    signal: input.signal,
  };
}

/** Idle consumer polling owns both the timer and its abort listener. */
function waitForNextPoll(
  milliseconds: number,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AbortError("Operation aborted", { cause: signal.reason }));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(new AbortError("Operation aborted", { cause: signal?.reason }));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
