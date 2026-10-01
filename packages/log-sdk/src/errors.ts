import type {
  AppendOutcome,
  LogOperation,
  ReadOperation,
} from "./types/errors.js";

export class LogError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** The operation that failed, with its diagnostic failure preserved as cause. */
export abstract class OperationError extends LogError {
  abstract readonly operation: LogOperation;
  declare readonly cause: LogError;

  protected constructor({
    operation,
    cause: failure,
  }: {
    operation: LogOperation;
    cause: unknown;
  }) {
    const isOperationError = failure instanceof OperationError;
    const diagnostic = isOperationError ? failure.cause : failure;
    const isError = diagnostic instanceof Error;
    const message = isError
      ? diagnostic.message
      : "Unexpected Log operation failure";
    const isLogError = diagnostic instanceof LogError;
    const cause = isLogError
      ? diagnostic
      : new LogError(message, { cause: diagnostic });
    super(`${operation} failed: ${cause.message}`, { cause });
  }
}

/** Only a failure before fetch dispatch establishes that this SDK sent nothing. */
export class AppendError extends OperationError {
  readonly operation = "append";
  readonly outcome: AppendOutcome;

  constructor(input: { outcome: AppendOutcome; cause: unknown }) {
    super({ operation: "append", cause: input.cause });
    this.outcome = input.outcome;
  }
}

export class ReadError extends OperationError {
  readonly operation: ReadOperation;

  constructor(input: { operation: ReadOperation; cause: unknown }) {
    super(input);
    this.operation = input.operation;
  }
}

/** An HTTP failure, including framework or proxy responses with non-JSON bodies. */
export class HttpError extends LogError {
  readonly status: number;
  readonly headers: Headers;
  readonly body: unknown;
  readonly method: string;
  readonly url: string;

  constructor(input: {
    message: string;
    status: number;
    headers: Headers;
    body: unknown;
    method: string;
    url: string;
  }) {
    super(input.message);
    this.status = input.status;
    this.headers = input.headers;
    this.body = input.body;
    this.method = input.method;
    this.url = input.url;
  }
}

/** The request may have reached the server. An append's outcome can be unknown. */
export class ConnectionError extends LogError {}
/** The request deadline expired. An append may already have committed. */
export class TimeoutError extends LogError {}
export class AbortError extends LogError {}
/** A successful response violated the expected API contract or codec. */
export class ProtocolError extends LogError {}
/** Invalid local configuration, request arguments, or event encoding. */
export class ValidationError extends LogError {}

export class EventEncodingError extends ValidationError {
  readonly index: number;

  constructor(input: { index: number; cause: unknown }) {
    super(`Failed to encode event at index ${input.index}`, {
      cause: input.cause,
    });
    this.index = input.index;
  }
}

export class EventDecodingError extends ProtocolError {
  readonly sequence: bigint;

  constructor(input: { sequence: bigint; cause: unknown }) {
    super(`Failed to decode event at sequence ${input.sequence}`, {
      cause: input.cause,
    });
    this.sequence = input.sequence;
  }
}
