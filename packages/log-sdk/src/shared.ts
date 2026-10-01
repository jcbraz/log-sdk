import { AppendError, ReadError } from "./errors.js";
import type { ReadOperation } from "./types/errors.js";

/** Each append owns its dispatch state; delegated appends retain their outcome. */
export async function runAppend<T>(
  append: (markDispatched: () => void) => Promise<T>,
): Promise<T> {
  let requestDispatched = false;
  try {
    return await append(() => {
      requestDispatched = true;
    });
  } catch (cause) {
    const isDelegatedAppendError = cause instanceof AppendError;
    if (isDelegatedAppendError) throw cause;
    throw new AppendError({
      outcome: requestDispatched ? "unknown" : "not-sent",
      cause,
    });
  }
}

export async function runRead<T>(
  operation: ReadOperation,
  read: () => Promise<T>,
): Promise<T> {
  try {
    return await read();
  } catch (cause) {
    const isSameReadOperation =
      cause instanceof ReadError && cause.operation === operation;
    if (isSameReadOperation) throw cause;
    throw new ReadError({ operation, cause });
  }
}
