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
  const handleCallerAbort = (): void => controller.abort(signal?.reason);
  signal?.addEventListener("abort", handleCallerAbort, { once: true });
  let timedOut = false;
  const timer = setTimeout((): void => {
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

    const isInjectedFetchOperationError = cause instanceof OperationError;
    const isRequestDiagnostic =
      cause instanceof LogError && !isInjectedFetchOperationError;
    if (isRequestDiagnostic) throw cause;
    throw new ConnectionError("Failed to complete Log request", { cause });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", handleCallerAbort);
  }
}
