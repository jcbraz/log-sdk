import {
  Log,
  AppendError,
  EventDecodingError,
  EventEncodingError,
  LogError,
  OperationError,
  ReadError,
  jsonCodec,
  type AppendOutcome,
  type Codec,
  type LogStream,
  type LogEntry,
  type StreamAppendRequest,
  type ScanRequest,
  type LogOperation,
  type ReadOperation,
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

// Generic signatures retain inference from either a codec or an unknown-input validator.
type JsonFactory = Assert<
  Equal<typeof jsonCodec, <T>(validate?: (value: unknown) => T) => Codec<T>>
>;
type StreamFactory = Assert<
  Equal<Log["stream"], <T>(key: string, codec?: Codec<T>) => LogStream<T>>
>;
type OrderCodec = Assert<
  Equal<ReturnType<typeof jsonCodec<OrderEvent>>, Codec<OrderEvent>>
>;
type BinaryStream = Assert<
  Equal<ReturnType<typeof log.stream<Uint8Array>>, LogStream<Uint8Array>>
>;
type FollowEntry = Assert<
  Equal<
    ReturnType<LogStream<OrderEvent>["follow"]>,
    AsyncIterable<LogEntry<OrderEvent>>
  >
>;
type AppendInput = Assert<
  Equal<
    Parameters<LogStream<OrderEvent>["append"]>[0],
    StreamAppendRequest<OrderEvent>
  >
>;

type InvalidEvent = Assert<
  // @ts-expect-error A typed stream rejects events with another schema.
  Assignable<{ values: readonly string[] }, StreamAppendRequest<OrderEvent>>
>;
// @ts-expect-error GET keys cannot contain arbitrary binary bytes.
type InvalidScanKey = Assert<Assignable<{ key: Uint8Array }, ScanRequest>>;
type InvalidSequence = Assert<
  // @ts-expect-error Sequences accept integer numbers or bigint, never decimal strings.
  Assignable<{ key: string; startSequence: string }, ScanRequest>
>;
type InvalidValidator = Assert<
  // @ts-expect-error A JSON validator must accept unknown, rather than asserting trust in an object.
  Assignable<(value: OrderEvent) => OrderEvent, (value: unknown) => OrderEvent>
>;

type InvalidStreamWidening = Assert<
  // @ts-expect-error A typed stream cannot accept arbitrary values through a widened stream reference.
  Assignable<LogStream<OrderEvent>, LogStream<unknown>>
>;

type ReadOperations = Assert<
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
type Operations = Assert<Equal<LogOperation, "append" | ReadOperation>>;
type AppendOutcomes = Assert<Equal<AppendOutcome, "not-sent" | "unknown">>;
type AppendOperation = Assert<Equal<AppendError["operation"], "append">>;
type ReadOperationField = Assert<Equal<ReadError["operation"], ReadOperation>>;
type OperationCause = Assert<Equal<OperationError["cause"], LogError>>;
type EventIndex = Assert<Equal<EventEncodingError["index"], number>>;
type EventSequence = Assert<Equal<EventDecodingError["sequence"], bigint>>;

declare const operationFailure: AppendError | ReadError;
if (operationFailure.operation === "append") {
  const appendFailure: AppendError = operationFailure;
  const outcome: AppendOutcome = appendFailure.outcome;
  void outcome;
} else {
  const readFailure: ReadError = operationFailure;
  const operation: ReadOperation = readFailure.operation;
  void operation;
  // @ts-expect-error Read failures cannot claim an append dispatch outcome.
  readFailure.outcome;
}

type InvalidReadOperation = Assert<
  // @ts-expect-error Appends have an outcome and cannot be represented as read failures.
  Assignable<"append", ReadOperation>
>;
// @ts-expect-error An operation failure needs a concrete read or append context.
new OperationError({ operation: "append", cause: new LogError("failed") });
