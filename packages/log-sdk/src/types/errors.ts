export type ReadOperation =
  | "scan"
  | "follow"
  | "count"
  | "listKeys"
  | "listSegments"
  | "healthy"
  | "ready"
  | "metrics";
export type LogOperation = "append" | ReadOperation;
export type AppendOutcome = "not-sent" | "unknown";
