# OpenData Log HTTP contract

Verified on 2026-09-30 against the [public OpenAPI specification](https://opendata.dev/docs/openapi/log.yaml), the five endpoint documentation pages, and [upstream revision `5f5c288`](https://github.com/opendata-oss/opendata/tree/5f5c28826921c1fe014e033c4506680be149d386/log). Integration tests also exercise the released `ghcr.io/opendata-oss/log:v1.0.0` image, whose image revision is `ca5a30393740e2d3817320b480443688315f0c64`.

## Endpoints

All sequence ranges are `[start, end)`. Query names are snake_case. JSON response names are camelCase.

| Method and path            | Request                                                                                                                          | Successful JSON response                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `POST /api/v1/log/append`  | `{records: [{key: base64, value: base64}], awaitDurable?: boolean}`                                                              | `{status: "success", recordsAppended: int32, startSequence: uint64}`                                  |
| `GET /api/v1/log/scan`     | Required `key: string`; optional `start_seq: uint64`, `end_seq: uint64`, `limit: usize`, `follow: boolean`, `timeout_ms: uint64` | `{status: "success", key: base64, values: [{sequence: uint64, value: base64}], nextSequence: uint64}` |
| `GET /api/v1/log/keys`     | Optional `start_segment: uint32`, `end_segment: uint32`, `limit: usize`                                                          | `{status: "success", keys: [{key: base64}]}`                                                          |
| `GET /api/v1/log/segments` | Optional `start_seq: uint64`, `end_seq: uint64`                                                                                  | `{status: "success", segments: [{id: uint32, startSeq: uint64, startTimeMs: int64}]}`                 |
| `GET /api/v1/log/count`    | Required `key: string`; optional `start_seq: uint64`, `end_seq: uint64`                                                          | `{status: "success", count: uint64}`                                                                  |
| `GET /-/healthy`           | None                                                                                                                             | Plain text `OK`, status 200                                                                           |
| `GET /-/ready`             | None                                                                                                                             | Plain text `OK`, status 200; `Not Ready`, status 503 when storage is unavailable                      |
| `GET /metrics`             | None                                                                                                                             | Prometheus text                                                                                       |

Defaults: `start_seq=0`, `end_seq=18446744073709551615`, `start_segment=0`, `end_segment=4294967295`, `limit=32`, `follow=false`, `timeout_ms=30000`, `awaitDurable=false`. Segments has no `limit` parameter.

References: [append](https://opendata.dev/docs/api-reference/append-records), [scan](https://opendata.dev/docs/api-reference/scan-entries), [keys](https://opendata.dev/docs/api-reference/list-keys), [segments](https://opendata.dev/docs/api-reference/list-segments), [count](https://opendata.dev/docs/api-reference/count-entries), [current request definitions](https://github.com/opendata-oss/opendata/blob/5f5c28826921c1fe014e033c4506680be149d386/log/src/server/request.rs), [current handlers](https://github.com/opendata-oss/opendata/blob/5f5c28826921c1fe014e033c4506680be149d386/log/src/server/handlers.rs).

## Encoding

Append accepts JSON with `Content-Type: application/json` or `application/protobuf+json`. Keys and values use standard base64 in JSON. Binary append accepts `application/protobuf`; `Accept: application/protobuf` selects binary success responses. Other Accept values select JSON, returned as `application/json`.

GET keys are ordinary URL-encoded UTF-8 strings, even when responses contain base64 bytes. Arbitrary byte keys can be appended and listed, but the HTTP scan/count query cannot address keys that are not valid UTF-8. A typed stream should therefore use string keys. Values remain arbitrary bytes.

The server serializes JSON uint64/int64 fields as numeric literals rather than decimal strings. Native `JSON.parse` can silently lose precision. The SDK returns these values as `bigint` and must preserve the original numeric token or use the binary response format. Counts, sequences and segment timestamps use their exact integer values.

The implemented protobuf messages are defined in [proto.rs](https://github.com/opendata-oss/opendata/blob/5f5c28826921c1fe014e033c4506680be149d386/log/src/server/proto.rs):

```protobuf
message Record { optional bytes key = 1; optional bytes value = 2; }
message AppendRequest { repeated Record records = 1; bool await_durable = 2; }
message AppendResponse { string status = 1; int32 records_appended = 2; uint64 start_sequence = 3; }
message Value { uint64 sequence = 1; bytes value = 2; }
message ScanResponse { string status = 1; optional bytes key = 2; repeated Value values = 3; uint64 next_sequence = 4; }
message Key { bytes key = 1; }
message KeysResponse { string status = 1; repeated Key keys = 2; }
message Segment { uint32 id = 1; uint64 start_seq = 2; int64 start_time_ms = 3; }
message SegmentsResponse { string status = 1; repeated Segment segments = 2; }
message CountResponse { string status = 1; uint64 count = 2; }
```

Append's optional byte fields distinguish missing fields from present empty bytes. Empty keys and values are accepted. A protobuf encoder must include present empty fields.

## Errors

[ApiError](https://github.com/opendata-oss/opendata/blob/5f5c28826921c1fe014e033c4506680be149d386/log/src/server/error.rs) maps invalid append input to 400 and storage, encoding or internal errors to 500. Its body is always JSON, including when the request asks for binary protobuf:

```json
{ "status": "error", "message": "Invalid input: record[0]: value is required" }
```

Framework errors do not use that envelope. Missing required GET `key`, malformed integers or malformed booleans produce 400 plain text such as `` Failed to deserialize query string: missing field `key` ``. Unknown routes produce 404; wrong methods produce 405; the default Axum request body limit can produce 413. A read-only gateway omits the append route, so append receives 404. A proxy can add other statuses and body formats. The SDK preserves status, headers and body in `HttpError`, exposed as the diagnostic cause of `AppendError` or `ReadError`.

The native HTTP server's default append body limit is 2 MiB of encoded request data, including base64 and JSON overhead. Integration tests send a 2 MiB raw value, verify the resulting oversized encoded request returns an `AppendError` caused by a plain-text 413 `HttpError`, and independently confirm that no record was appended. The exception still reports `outcome: "unknown"`: the SDK cannot establish storage outcomes from status alone across arbitrary proxies. Choose batches by encoded size when approaching the server limit. A single scan value may exceed that request limit when another native writer produced it; response decoding is tested with a 16 MiB base64 value.

Queue exhaustion and writer shutdown currently produce 500 with an internal-error message, not 429. There is no structured machine-readable server error code and no append idempotency token.

## Producer and consumer semantics

Records in one append receive consecutive global sequences in input order, and the batch is written atomically. Each key's sequences are increasing but can have gaps because other keys use the same counter and recovery skips unused sequence allocations. A sequence is a position, not a per-key event count.

`awaitDurable=false` acknowledges before durable persistence. `awaitDurable=true` performs a flush after append and waits for durability, including earlier pending writes. A timeout, disconnect or flush error can occur after records were accepted; automatically retrying append can duplicate events. Consumers should make their application handling idempotent when retrying failed processing.

The SDK exposes this uncertainty through `AppendError.outcome`. Only a failure before fetch dispatch is `"not-sent"`; every dispatched failure is `"unknown"`, including HTTP failures and invalid acknowledgement payloads. A live integration test lets the server accept one durable append, then drops its successful acknowledgement in the injected fetch. The SDK reports `AppendError` caused by `ConnectionError`, never retries, and an independent count confirms exactly one stored record. Read failures use `ReadError.operation` with the diagnostic cause preserved; follow reports `"follow"` even when its failed step was a scan.

Scan returns entries ordered by sequence. Its `nextSequence` is an exclusive resume cursor. When a scan is truncated, this is the last returned sequence plus one. When a scan drains, it may advance further to the global observed frontier, including for an empty key, so callers can skip an observed empty range. Pass it back as `start_seq` without incrementing it again. Preserve a cursor after handling entries successfully. Current SDK compatibility permits missing `nextSequence` on older servers; a consumer can fall back to the last entry's sequence plus one, retaining its current cursor for an empty response.

`follow=true` returns available entries immediately. When the initial scan is empty, the server scans every 100 ms until data arrives or its timeout expires. It is an HTTP long poll. A reader gateway discovers durable data periodically and may lag the writer. Log provides no HTTP consumer groups, offset store, acknowledgements, dead-letter queues or exactly-once processing. [The Log overview](https://opendata.dev/docs/log) explicitly requires applications to track offsets themselves.

Keys are distinct and sorted by their byte representation. The keys endpoint truncates results at `limit` and has no key pagination cursor. Repeated requests cannot retrieve the next page for the same segment range; the SDK does not invent pagination.

## Documentation and source drift

The implementation and live server take precedence when documentation disagrees. The integration suite records supported behavior instead of assuming every prose claim is enforced.

| Difference                                                 | Verified behavior                                                                                  |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Public OpenAPI omits `nextSequence`                        | Current source and released v1.0.0 include it                                                      |
| Draft HTTP RFC wraps keys as `{value: base64}`             | Current append/scan use flat base64; key listing uses `{key: base64}`                              |
| Draft RFC documents scan/keys defaults of 1000             | Current handler defaults are 32                                                                    |
| Segment page says segment start must fall within the range | Implementation returns segments overlapping the range, including a segment starting before it      |
| Storage page and examples start user segments at 0         | Current user segments begin at 1; 0 is reserved for system data                                    |
| Draft RFC says empty append is 400                         | Implementation returns 200 with `recordsAppended=0`, `startSequence=0`                             |
| Draft RFC says invalid ranges are 400                      | Equal or reversed ranges return empty reads/count zero                                             |
| OpenAPI permits `limit=0`                                  | Current handler returns one item when any exists because it checks the limit after pushing an item |
| Docs describe all errors with JSON envelopes               | GET query rejections and routing/body-limit errors can be plain text or empty                      |
