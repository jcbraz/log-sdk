import { AbortError, ReadError, ValidationError } from "../errors.js";
import { sequence } from "../protocol.js";
import type { RequestOptions } from "../types/client.js";
import type { LogEntry } from "../types/records.js";
import type { FollowRequest, StreamScanRequest } from "../types/stream.js";
import type {
  FollowSettings,
  FollowSource,
  SequenceRange,
  StreamFollow,
} from "./types.js";

const MAX_TIMER_MS = 2_147_483_647;
const LONG_POLL_COMPLETION_MARGIN_MS = 5_000;

export function createFollow<T>(stream: FollowSource<T>): StreamFollow<T> {
  return async function* follow(
    input: FollowRequest = {},
  ): AsyncIterable<LogEntry<T>> {
    try {
      yield* followPages({ stream, settings: followSettings(input) });
    } catch (cause) {
      throw new ReadError({ operation: "follow", cause });
    }
  };
}

async function* followPages<T>({
  stream,
  settings,
}: {
  stream: FollowSource<T>;
  settings: FollowSettings;
}): AsyncIterable<LogEntry<T>> {
  const { startSequence, endSequence, pollIntervalMs, signal } = settings;
  const scanRequest: StreamScanRequest = {
    limit: settings.limit,
    follow: true,
    timeoutMs: settings.serverTimeoutMs,
  };
  if (endSequence !== undefined) scanRequest.endSequence = endSequence;

  const requestOptions: RequestOptions = { timeoutMs: settings.httpTimeoutMs };
  if (signal !== undefined) requestOptions.signal = signal;

  let nextSequence = startSequence;
  while (endSequence === undefined || nextSequence < endSequence) {
    throwIfFollowAborted(signal);
    const startedAt = performance.now();
    const page = await stream.scan(
      { ...scanRequest, startSequence: nextSequence },
      requestOptions,
    );

    const lastEntry = page.values.at(-1);
    const nextPageSequence =
      page.nextSequence ?? (lastEntry ? lastEntry.sequence + 1n : nextSequence);

    for (const entry of page.values) {
      throwIfFollowAborted(signal);
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
}

function throwIfFollowAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new AbortError("Follow aborted", { cause: signal.reason });
  }
}

function followSettings(input: FollowRequest): FollowSettings {
  const range = followRange(input);
  const limit = followLimit(input.limit ?? 100);
  const serverTimeoutMs = followServerTimeout(input.timeoutMs ?? 30_000);
  const pollIntervalMs = followPollInterval(input.pollIntervalMs ?? 100);
  return {
    ...range,
    limit,
    serverTimeoutMs,
    httpTimeoutMs: serverTimeoutMs + LONG_POLL_COMPLETION_MARGIN_MS,
    pollIntervalMs,
    signal: input.signal,
  };
}

function followRange(input: FollowRequest): SequenceRange {
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
  return { startSequence, endSequence };
}

function followLimit(limit: number): number {
  const isLimitValid = Number.isSafeInteger(limit) && limit >= 1;
  if (!isLimitValid) {
    throw new ValidationError("limit must be a positive safe integer");
  }
  return limit;
}

function followServerTimeout(serverTimeoutMs: number): number {
  const maximumPollTimeout = MAX_TIMER_MS - LONG_POLL_COMPLETION_MARGIN_MS;
  const isServerTimeoutValid =
    Number.isSafeInteger(serverTimeoutMs) &&
    serverTimeoutMs >= 0 &&
    serverTimeoutMs <= maximumPollTimeout;
  if (!isServerTimeoutValid) {
    throw new ValidationError(
      `timeoutMs must be an integer between 0 and ${maximumPollTimeout}`,
    );
  }
  return serverTimeoutMs;
}

function followPollInterval(pollIntervalMs: number): number {
  const isPollIntervalValid =
    Number.isSafeInteger(pollIntervalMs) &&
    pollIntervalMs >= 1 &&
    pollIntervalMs <= MAX_TIMER_MS;
  if (!isPollIntervalValid) {
    throw new ValidationError(
      `pollIntervalMs must be an integer between 1 and ${MAX_TIMER_MS}`,
    );
  }
  return pollIntervalMs;
}

/** Idle consumer polling owns both the timer and its abort listener. */
function waitForNextPoll(
  milliseconds: number,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject): void => {
    if (signal?.aborted) {
      reject(new AbortError("Operation aborted", { cause: signal.reason }));
      return;
    }
    const timer = setTimeout((): void => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, milliseconds);
    const handleAbort = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", handleAbort);
      reject(new AbortError("Operation aborted", { cause: signal?.reason }));
    };
    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}
