# Changelog

## 0.1.0

- Typed HTTP client for all five data endpoints and health, readiness and metrics.
- JSON event streams with codecs, demand-driven long polling and application-owned checkpoints.
- Exact bigint positions/counts/timestamps, decoded bytes and explicit errors.
- Operation errors distinguish appends from reads, retain diagnostic causes and expose uncertain write outcomes. Codec errors identify the batch index or stored sequence.
- Each operation makes one HTTP request; automatic retries are not part of the client.
- Zero runtime dependencies; ESM/CommonJS distributions and TypeScript declarations.
