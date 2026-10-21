import {
  type AppendError,
  type AppendOutcome,
  type Codec,
  type EventDecodingError,
  type EventEncodingError,
  type jsonCodec,
  type Log,
  type LogEntry,
  LogError,
  type LogOperation,
  type LogStream,
  OperationError,
  type ReadError,
  type ReadOperation,
  type ScanRequest,
  type StreamAppendRequest,
} from "../src/index.js";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Assert<T extends true> = T;
type Assignable<A, B> = A extends B ? true : false;
interface OrderEvent {
  id: string;
  total: number;
}
declare const log: Log;

export type JsonFactory = Assert<
  Equal<typeof jsonCodec, <T>(validate?: (value: unknown) => T) => Codec<T>>
>;
export type StreamFactory = Assert<
  Equal<Log["stream"], <T>(key: string, codec?: Codec<T>) => LogStream<T>>
>;
export type OrderCodec = Assert<
  Equal<ReturnType<typeof jsonCodec<OrderEvent>>, Codec<OrderEvent>>
>;
export type BinaryStream = Assert<
  Equal<ReturnType<typeof log.stream<Uint8Array>>, LogStream<Uint8Array>>
>;
export type FollowEntry = Assert<
  Equal<
    ReturnType<LogStream<OrderEvent>["follow"]>,
    AsyncIterable<LogEntry<OrderEvent>>
  >
>;
export type AppendInput = Assert<
  Equal<
    Parameters<LogStream<OrderEvent>["append"]>[0],
    StreamAppendRequest<OrderEvent>
  >
>;

export type StreamRejectsEventsWithAnotherSchema = Assert<
  // @ts-expect-error
  Assignable<{ values: readonly string[] }, StreamAppendRequest<OrderEvent>>
>;
export type ScanKeyRejectsBinaryBytes = Assert<
  // @ts-expect-error
  Assignable<{ key: Uint8Array }, ScanRequest>
>;
export type SequenceRejectsDecimalStrings = Assert<
  // @ts-expect-error
  Assignable<{ key: string; startSequence: string }, ScanRequest>
>;
export type JsonValidatorMustAcceptUnknown = Assert<
  // @ts-expect-error
  Assignable<(value: OrderEvent) => OrderEvent, (value: unknown) => OrderEvent>
>;

export type TypedStreamRejectsWidenedEvents = Assert<
  // @ts-expect-error
  Assignable<LogStream<OrderEvent>, LogStream<unknown>>
>;

export type ReadOperations = Assert<
  Equal<
    ReadOperation,
    | "scan"
    | "follow"
    | "count"
    | "listKeys"
    | "listSegments"
    | "healthy"
    | "ready"
    | "metrics"
  >
>;
export type Operations = Assert<Equal<LogOperation, "append" | ReadOperation>>;
export type AppendOutcomes = Assert<
  Equal<AppendOutcome, "not-sent" | "unknown">
>;
export type AppendOperation = Assert<Equal<AppendError["operation"], "append">>;
export type ReadOperationField = Assert<
  Equal<ReadError["operation"], ReadOperation>
>;
export type OperationCause = Assert<Equal<OperationError["cause"], LogError>>;
export type EventIndex = Assert<Equal<EventEncodingError["index"], number>>;
export type EventSequence = Assert<
  Equal<EventDecodingError["sequence"], bigint>
>;

declare const operationFailure: AppendError | ReadError;
if (operationFailure.operation === "append") {
  const appendFailure: AppendError = operationFailure;
  const outcome: AppendOutcome = appendFailure.outcome;
  void outcome;
} else {
  const readFailure: ReadError = operationFailure;
  const operation: ReadOperation = readFailure.operation;
  void operation;
  // @ts-expect-error
  readFailure.outcome;
}

export type AppendIsNotAReadOperation = Assert<
  // @ts-expect-error
  Assignable<"append", ReadOperation>
>;
// @ts-expect-error
new OperationError({ operation: "append", cause: new LogError("failed") });
