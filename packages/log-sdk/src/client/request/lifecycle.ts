import {
  AbortError,
  ConnectionError,
  LogError,
  OperationError,
  TimeoutError,
} from "../../errors.js";

/** Keep the deadline active through body reading; every exit releases the timer and caller listener. */
export async function withRequestDeadline<T>(
  { timeoutMs, signal }: { timeoutMs: number; signal: AbortSignal | undefined },
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  if (signal?.aborted)
    throw new AbortError("Request aborted", { cause: signal.reason });

  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await run(controller.signal);
  } catch (cause) {
    if (signal?.aborted)
      throw new AbortError("Request aborted", { cause: signal.reason });
    if (timedOut)
      throw new TimeoutError(`Request timed out after ${timeoutMs} ms`, {
        cause,
      });

    // An injected fetch's operation error cannot redefine this request's dispatch outcome.
    const isOperationError = cause instanceof OperationError;
    const isDiagnostic = cause instanceof LogError && !isOperationError;
    if (isDiagnostic) throw cause;
    throw new ConnectionError("Failed to complete Log request", { cause });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
