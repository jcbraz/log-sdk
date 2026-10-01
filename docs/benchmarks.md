# API and SDK benchmark

Append latency measured on 2026-09-30 with Bun 1.4.2 and a local OpenData Log server: durable writes, 1,024-byte event details, four keys, three 12-second rounds per rate.

| Events/s | Native API p50 | SDK p50  | Native API p95 | SDK p95  |
| -------- | -------------- | -------- | -------------- | -------- |
| 5        | 1.342 ms       | 1.405 ms | 2.213 ms       | 2.230 ms |
| 10       | 1.506 ms       | 1.520 ms | 2.161 ms       | 2.267 ms |
| 100      | 1.128 ms       | 1.121 ms | 1.898 ms       | 1.924 ms |
