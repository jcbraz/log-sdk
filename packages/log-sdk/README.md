# OpenData Log SDK

A TypeScript SDK for the [OpenData Log API](https://www.opendata.dev/docs/log), with typed event streams and zero runtime dependencies. Supports Bun and Node.js 22+; ships ESM, CommonJS and TypeScript declarations.

- [OpenData source](https://github.com/opendata-oss/opendata/tree/main/log)
- [Run Log locally](https://www.opendata.dev/docs/log/quickstart)
- [Deploy Log to production](https://www.opendata.dev/docs/log/production)

```bash
bun add opendata-log
```

## Client

```ts
import { Log } from "opendata-log";

const log = new Log({
  baseURL: "http://localhost:8081",
  // headers: { Authorization: "Bearer your-proxy-token" },
});

await log.append({
  records: [{ key: "messages", value: "hello" }],
  awaitDurable: true,
});

await log.scan({ key: "messages", startSequence: 0n, limit: 100 });
await log.count({ key: "messages" });
await log.listKeys({ limit: 100 });
await log.listSegments({ startSequence: 0n });

await log.healthy(); // "OK"
await log.ready(); // "OK"
await log.metrics(); // Prometheus text

const notifications = log.stream<{ text: string }>("notifications");
```

`baseURL` is the server origin or reverse-proxy prefix, without `/api/v1/log`. Raw appends accept UTF-8 strings or `Uint8Array`; raw scans return bytes. Sequences and counts are `bigint`. Ranges include `startSequence` and exclude `endSequence`.

Data methods accept `{ signal, timeoutMs }` as their second argument; health, readiness and metrics accept it as their only argument. The HTTP timeout defaults to 35 seconds. A scan's input `timeoutMs` controls server long polling separately. `awaitDurable` defaults to `false`; set it to `true` to wait for durable storage.

## Examples

Runnable examples are in [`packages/log-sdk/examples`](https://github.com/jcbraz/log-sdk/tree/master/packages/log-sdk/examples). With a Log instance running, build the SDK and run either example from the repository root:

```bash
bun run build
LOG_URL=http://localhost:8081 bun packages/log-sdk/examples/orders.ts
LOG_URL=http://localhost:8081 bun packages/log-sdk/examples/agent-stream.ts
```

### Orders

```ts
type OrderCreated = {
  type: "order.created";
  orderId: string;
  totalCents: number;
};

const orders = log.stream<OrderCreated>("orders"); // JSON codec by default

const ack = await orders.append({
  values: [{ type: "order.created", orderId: "o-123", totalCents: 4995 }],
  awaitDurable: true,
});

const page = await orders.scan({
  startSequence: ack.startSequence,
  endSequence: ack.startSequence + 1n,
});

console.log(page.values[0]?.value); // Decoded OrderCreated object
```

For a long-running consumer, `follow` fetches pages as needed and waits for new entries:

```ts
const checkpoint = await loadCheckpoint(); // bigint: next position to read

for await (const entry of orders.follow({ startSequence: checkpoint })) {
  await handleOrder(entry.value);
  await saveCheckpoint(entry.sequence + 1n);
}
```

Checkpoint storage and event handling are application functions. Save after processing and make handlers safe to replay. Store bigint checkpoints as decimal strings when using JSON. Pass an `AbortSignal` to `follow` to cancel it.

Type parameters describe the expected event shape. For runtime validation, pass `jsonCodec(validate)` to `log.stream`, or supply a custom `Codec<T>`.

### Agent

```ts
import { Log } from "opendata-log";

type AgentRunEvent =
  | { type: "run.started"; agentId: string }
  | { type: "message.delta"; messageId: string; text: string }
  | { type: "tool.started"; toolCallId: string; name: string }
  | { type: "tool.finished"; toolCallId: string }
  | { type: "run.completed"; messageId: string }
  | { type: "run.failed"; message: string };

const log = new Log({ baseURL: process.env.LOG_URL! });

const runId = crypto.randomUUID();
const events = log.stream<AgentRunEvent>(`agent-runs/${runId}`);

// Your agent runner starts the run; the SDK records that fact.
await events.append({
  values: [{ type: "run.started", agentId: "support-agent" }],
  awaitDurable: true,
});

// Batch model chunks to reduce HTTP requests.
await events.append({
  values: [
    { type: "message.delta", messageId: "msg-1", text: "I found " },
    { type: "message.delta", messageId: "msg-1", text: "the answer." },
  ],
});

await events.append({
  values: [{ type: "run.completed", messageId: "msg-1" }],
  awaitDurable: true,
});
```

A UI or worker can follow that run's events:

```ts
const run = log.stream<AgentRunEvent>(`agent-runs/${runId}`);

for await (const { sequence, value } of run.follow({ startSequence: 0n })) {
  switch (value.type) {
    case "message.delta":
      renderText(value.messageId, value.text);
      break;
    case "tool.started":
      showToolRunning(value.name);
      break;
    case "run.completed":
      markRunComplete();
      break;
    case "run.failed":
      showRunError(value.message);
      break;
  }

  await saveCheckpoint(runId, sequence + 1n);

  if (value.type === "run.completed" || value.type === "run.failed") break;
}
```

Rendering and checkpoint functions belong to your application. Resume from the saved checkpoint when reconnecting.

## Errors

Writes throw `AppendError`; reads throw `ReadError`. Their `cause` identifies HTTP, connection, timeout, cancellation, validation or decoding failures. `AppendError.outcome` is `"not-sent"` for a local failure before dispatch and `"unknown"` after dispatch. The SDK does not retry requests automatically.

## Development

From the repository root:

```bash
bun install --frozen-lockfile
bun run build
bun run typecheck
bun run test
bun run lint
bun run check:package
```
