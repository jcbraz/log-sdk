import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import {
  AbortError,
  AppendError,
  ConnectionError,
  EventDecodingError,
  EventEncodingError,
  HttpError,
  jsonCodec,
  Log,
  ReadError,
  TimeoutError,
} from "../src/index.js";
import type { LogOperation } from "../src/index.js";

const baseURL = process.env.LOG_BASE_URL ?? "http://127.0.0.1:18080";
const readOnlyURL = process.env.LOG_READ_ONLY_URL;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function uniqueKey(label: string): string {
  return `sdk-integration/${label}/${randomUUID()}`;
}

function requestURL(input: Parameters<typeof fetch>[0]): URL {
  return new URL(input instanceof Request ? input.url : input.toString());
}

function mutateQuery(mutate: (url: URL) => void): typeof fetch {
  return (input, init) => {
    const url = requestURL(input);
    mutate(url);
    return fetch(url, init);
  };
}

function httpCause(
  error: unknown,
  operation: LogOperation,
  status: number,
  bodyKind?: "string" | "object",
): HttpError {
  if (operation === "append") {
    assert.ok(error instanceof AppendError);
    assert.equal(error.outcome, "unknown");
  } else assert.ok(error instanceof ReadError);
  assert.equal(error.operation, operation);
  assert.ok(error.cause instanceof HttpError);
  assert.equal(error.cause.status, status);
  assert.ok(error.cause.headers instanceof Headers);
  if (bodyKind) assert.equal(typeof error.cause.body, bodyKind);
  return error.cause;
}

test("all data endpoints preserve byte values, global positions and exclusive ranges", async () => {
  const client = new Log({ baseURL });
  const key = `${uniqueKey("encoding")}/café?&=+\u0000🧪`;
  const otherKey = uniqueKey("interleaved");
  const firstValue = new Uint8Array([0, 1, 255, 128, 0, 13, 10]);
  const lastValue = JSON.stringify({ type: "order.created", name: "café 🥖" });

  const appended = await client.append({
    records: [
      { key: encoder.encode(key), value: firstValue },
      { key: otherKey, value: "interleaved event" },
      { key, value: lastValue },
    ],
    awaitDurable: true,
  });

  assert.equal(appended.status, "success");
  assert.equal(appended.recordsAppended, 3);
  assert.equal(typeof appended.startSequence, "bigint");

  const scanned = await client.scan({
    key,
    startSequence: appended.startSequence,
  });
  assert.equal(scanned.status, "success");
  assert.deepEqual(scanned.key, encoder.encode(key));
  assert.deepEqual(scanned.values, [
    { sequence: appended.startSequence, value: firstValue },
    { sequence: appended.startSequence + 2n, value: encoder.encode(lastValue) },
  ]);
  if (scanned.nextSequence !== undefined) {
    assert.equal(typeof scanned.nextSequence, "bigint");
    assert.ok(scanned.nextSequence >= appended.startSequence + 3n);
  }

  const firstPage = await client.scan({
    key,
    startSequence: appended.startSequence,
    limit: 1,
  });
  assert.equal(firstPage.values.length, 1);
  const cursor = firstPage.nextSequence ?? firstPage.values[0]!.sequence + 1n;
  assert.equal(cursor, appended.startSequence + 1n);
  const secondPage = await client.scan({
    key,
    startSequence: cursor,
    limit: 1,
  });
  assert.deepEqual(secondPage.values, [scanned.values[1]]);

  const range = {
    key,
    startSequence: appended.startSequence,
    endSequence: appended.startSequence + 2n,
  };
  assert.deepEqual((await client.scan(range)).values, [scanned.values[0]]);
  assert.deepEqual(await client.count(range), { status: "success", count: 1n });
  assert.deepEqual(await client.count({ key }), {
    status: "success",
    count: 2n,
  });

  const listedKeys = await client.listKeys({ limit: 10_000 });
  assert.equal(listedKeys.status, "success");
  assert.equal(
    listedKeys.keys.filter(
      ({ key: bytes }) => Buffer.compare(bytes, encoder.encode(key)) === 0,
    ).length,
    1,
  );
  assert.equal(
    listedKeys.keys.filter(
      ({ key: bytes }) => Buffer.compare(bytes, encoder.encode(otherKey)) === 0,
    ).length,
    1,
  );
  for (let index = 1; index < listedKeys.keys.length; index++) {
    assert.ok(
      Buffer.compare(
        listedKeys.keys[index - 1]!.key,
        listedKeys.keys[index]!.key,
      ) < 0,
    );
  }

  const listedSegments = await client.listSegments({
    startSequence: appended.startSequence,
    endSequence: appended.startSequence + 3n,
  });
  assert.equal(listedSegments.status, "success");
  assert.ok(listedSegments.segments.length >= 1);
  assert.ok(listedSegments.segments[0]!.startSeq <= appended.startSequence);
  for (const segment of listedSegments.segments) {
    assert.equal(typeof segment.id, "number");
    assert.equal(typeof segment.startSeq, "bigint");
    assert.equal(typeof segment.startTimeMs, "bigint");
    assert.ok(segment.startTimeMs > 0n);
  }
});

test("empty payloads and empty/reversed ranges match the actual server behavior", async () => {
  const client = new Log({ baseURL });
  assert.deepEqual(await client.append({ records: [] }), {
    status: "success",
    recordsAppended: 0,
    startSequence: 0n,
  });

  const key = uniqueKey("empty-value");
  const appended = await client.append({
    records: [{ key, value: new Uint8Array() }],
    awaitDurable: true,
  });
  const emptyPayload = await client.scan({
    key,
    startSequence: appended.startSequence,
  });
  assert.deepEqual(emptyPayload.values, [
    { sequence: appended.startSequence, value: new Uint8Array() },
  ]);

  const emptyKeyAppend = await client.append({
    records: [{ key: new Uint8Array(), value: "empty key" }],
    awaitDurable: true,
  });
  const emptyKeyScan = await client.scan({
    key: "",
    startSequence: emptyKeyAppend.startSequence,
    endSequence: emptyKeyAppend.startSequence + 1n,
  });
  assert.deepEqual(emptyKeyScan.key, new Uint8Array());
  assert.deepEqual(emptyKeyScan.values, [
    {
      sequence: emptyKeyAppend.startSequence,
      value: encoder.encode("empty key"),
    },
  ]);

  const unknownKey = uniqueKey("missing");
  assert.deepEqual((await client.scan({ key: unknownKey })).values, []);
  assert.deepEqual(await client.count({ key: unknownKey }), {
    status: "success",
    count: 0n,
  });

  const reversed = { startSequence: 10n, endSequence: 1n };
  assert.deepEqual((await client.scan({ key, ...reversed })).values, []);
  assert.deepEqual(await client.count({ key, ...reversed }), {
    status: "success",
    count: 0n,
  });
  assert.deepEqual(await client.listSegments(reversed), {
    status: "success",
    segments: [],
  });
  assert.deepEqual(await client.listKeys({ startSegment: 10, endSegment: 1 }), {
    status: "success",
    keys: [],
  });
  assert.deepEqual(
    (await client.scan({ key, startSequence: 1n, endSequence: 1n })).values,
    [],
  );
});

test("zero limits reflect server truncation and keys have no invented continuation", async () => {
  const client = new Log({ baseURL });
  const key = uniqueKey("zero-limit");
  await client.append({
    records: [
      { key, value: "first" },
      { key, value: "second" },
    ],
    awaitDurable: true,
  });
  const scanned = await client.scan({ key, limit: 0 });
  assert.equal(scanned.values.length, 1);
  assert.equal(decoder.decode(scanned.values[0]!.value), "first");
  const keys = await client.listKeys({ limit: 0 });
  assert.equal(keys.keys.length, 1);
});

test("append surfaces the server's JSON validation error", async () => {
  const malformedAppend: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set("Content-Type", "application/json");
    return fetch(input, {
      ...init,
      headers,
      body: JSON.stringify({
        records: [{ key: Buffer.from("invalid-record").toString("base64") }],
      }),
    });
  };
  const client = new Log({ baseURL, fetch: malformedAppend });
  await assert.rejects(
    client.append({ records: [{ key: "ignored", value: "ignored" }] }),
    (error: unknown) => {
      const cause = httpCause(error, "append", 400, "object");
      assert.match(cause.message, /value is required/);
      assert.equal(cause.method, "POST");
      return true;
    },
  );
});

test("oversized append preserves the real server's 413 rejection and writes nothing", async () => {
  const client = new Log({ baseURL });
  const key = uniqueKey("body-limit");
  await assert.rejects(
    client.append({
      records: [{ key, value: new Uint8Array(2 * 1024 * 1024) }],
    }),
    (error: unknown) => {
      const cause = httpCause(error, "append", 413, "string");
      assert.match(cause.message, /length limit exceeded|body too large/i);
      assert.equal(cause.method, "POST");
      return true;
    },
  );
  assert.deepEqual(await client.count({ key }), {
    status: "success",
    count: 0n,
  });
});

test("a lost append acknowledgement reports an unknown outcome without retrying the accepted write", async () => {
  const key = uniqueKey("lost-acknowledgement");
  const acknowledgementLost = new Error(
    "Connection closed before acknowledgement",
  );
  let appendCalls = 0;
  const loseAppendAcknowledgement: typeof fetch = async (input, init) => {
    const response = await fetch(input, init);
    if (init?.method === "POST") {
      appendCalls++;
      assert.equal(response.status, 200);
      await response.text();
      throw acknowledgementLost;
    }
    return response;
  };
  const client = new Log({
    baseURL,
    fetch: loseAppendAcknowledgement,
  });

  await assert.rejects(
    client.append({
      records: [{ key, value: "accepted before the connection failed" }],
      awaitDurable: true,
    }),
    (error: unknown) => {
      assert.ok(error instanceof AppendError);
      assert.equal(error.operation, "append");
      assert.equal(error.outcome, "unknown");
      assert.ok(error.cause instanceof ConnectionError);
      assert.equal(error.cause.cause, acknowledgementLost);
      return true;
    },
  );
  assert.equal(appendCalls, 1);
  assert.deepEqual(await client.count({ key }), {
    status: "success",
    count: 1n,
  });
});

test("event encoding failures identify the batch index and leave the whole batch unsent", async () => {
  const client = new Log({ baseURL });
  const key = uniqueKey("encoding-failure");
  const invalidEvent = new Error("Invalid event schema");
  const stream = client.stream(key, {
    encode: (value: string) => {
      if (value === "bad") throw invalidEvent;
      return encoder.encode(value);
    },
    decode: (value: Uint8Array) => decoder.decode(value),
  });

  await assert.rejects(
    stream.append({ values: ["good", "bad"], awaitDurable: true }),
    (error: unknown) => {
      assert.ok(error instanceof AppendError);
      assert.equal(error.operation, "append");
      assert.equal(error.outcome, "not-sent");
      assert.ok(error.cause instanceof EventEncodingError);
      assert.equal(error.cause.index, 1);
      assert.equal(error.cause.cause, invalidEvent);
      return true;
    },
  );
  assert.deepEqual(await client.count({ key }), {
    status: "success",
    count: 0n,
  });
});

test("scan/count/keys/segments surface real plain-text query errors", async () => {
  for (const endpoint of ["scan", "count", "keys", "segments"] as const) {
    const client = new Log({
      baseURL,
      fetch: mutateQuery((url) => {
        if (endpoint === "scan" || endpoint === "count")
          url.searchParams.delete("key");
        else
          url.searchParams.set(
            endpoint === "keys" ? "start_segment" : "start_seq",
            "-1",
          );
      }),
    });
    let operation: Promise<unknown>;
    switch (endpoint) {
      case "scan":
        operation = client.scan({ key: "irrelevant" });
        break;
      case "count":
        operation = client.count({ key: "irrelevant" });
        break;
      case "keys":
        operation = client.listKeys();
        break;
      case "segments":
        operation = client.listSegments();
        break;
    }
    await assert.rejects(operation, (error: unknown) => {
      const name =
        endpoint === "keys"
          ? "listKeys"
          : endpoint === "segments"
            ? "listSegments"
            : endpoint;
      const cause = httpCause(error, name, 400, "string");
      assert.match(String(cause.body), /Failed to deserialize query string/);
      assert.match(cause.headers.get("Content-Type") ?? "", /^text\/plain/);
      return true;
    });
  }
});

test("scan long-polls for new events and returns a bounded empty poll", async () => {
  const client = new Log({ baseURL });
  const key = uniqueKey("follow");
  const waiting = client.scan({ key, follow: true, timeoutMs: 2_000 });
  await delay(40);
  const appended = await client.append({
    records: [{ key, value: "arrived" }],
    awaitDurable: true,
  });
  const received = await waiting;
  assert.deepEqual(received.values, [
    { sequence: appended.startSequence, value: encoder.encode("arrived") },
  ]);

  const before = performance.now();
  const empty = await client.scan({
    key: uniqueKey("idle"),
    follow: true,
    timeoutMs: 30,
  });
  assert.deepEqual(empty.values, []);
  assert.ok(performance.now() - before >= 20);
});

test("long-poll request deadlines and caller cancellation have distinct exceptions", async () => {
  const client = new Log({ baseURL });
  await assert.rejects(
    client.scan(
      { key: uniqueKey("timeout"), follow: true, timeoutMs: 2_000 },
      { timeoutMs: 20 },
    ),
    (error: unknown) => {
      assert.ok(error instanceof ReadError);
      assert.equal(error.operation, "scan");
      assert.ok(error.cause instanceof TimeoutError);
      return true;
    },
  );

  const cancelled = new AbortController();
  const waiting = client.scan(
    { key: uniqueKey("abort"), follow: true, timeoutMs: 2_000 },
    { signal: cancelled.signal },
  );
  setTimeout(() => cancelled.abort(new Error("consumer stopped")), 20);
  await assert.rejects(waiting, (error: unknown) => {
    assert.ok(error instanceof ReadError);
    assert.equal(error.operation, "scan");
    assert.ok(error.cause instanceof AbortError);
    return true;
  });

  const stop = new AbortController();
  const following = client
    .stream(uniqueKey("follow-abort"))
    .follow({ signal: stop.signal, timeoutMs: 2_000 })
    [Symbol.asyncIterator]()
    .next();
  setTimeout(() => stop.abort(), 20);
  await assert.rejects(following, (error: unknown) => {
    assert.ok(error instanceof ReadError);
    assert.equal(error.operation, "follow");
    assert.ok(error.cause instanceof AbortError);
    return true;
  });
});

test("operational endpoints return text and preserve HTTP failures", async () => {
  const client = new Log({ baseURL });
  assert.equal(await client.healthy(), "OK");
  assert.equal(await client.ready(), "OK");
  assert.match(await client.metrics(), /log_append_records_total/);

  const missingRoute = new Log({
    baseURL,
    fetch: mutateQuery((url) => {
      url.pathname = `/missing-sdk-route/${randomUUID()}`;
    }),
  });
  for (const operation of ["healthy", "ready", "metrics"] as const) {
    await assert.rejects(missingRoute[operation](), (error: unknown) => {
      httpCause(error, operation, 404);
      return true;
    });
  }
});

test("typed consumers resume from a persisted checkpoint across global sequence gaps", async () => {
  type OrderCreated = { type: "order.created"; orderId: string };
  const client = new Log({ baseURL });
  const key = uniqueKey("checkpoint");
  const stream = client.stream<OrderCreated>(key);
  const events: OrderCreated[] = [
    { type: "order.created", orderId: "order-1" },
    { type: "order.created", orderId: "order-2" },
  ];
  const appended = await client.append({
    records: [
      { key, value: JSON.stringify(events[0]) },
      { key: uniqueKey("unrelated"), value: "other stream" },
      { key, value: JSON.stringify(events[1]) },
    ],
    awaitDurable: true,
  });
  const directory = await mkdtemp(join(tmpdir(), "log-sdk-checkpoint-"));
  const checkpointPath = join(directory, "orders.offset");
  const handled: OrderCreated[] = [];
  try {
    for await (const entry of stream.follow({
      startSequence: appended.startSequence,
      limit: 1,
    })) {
      handled.push(entry.value);
      await writeFile(checkpointPath, String(entry.sequence + 1n));
      break;
    }
    const checkpoint = BigInt(await readFile(checkpointPath, "utf8"));
    assert.equal(checkpoint, appended.startSequence + 1n);

    for await (const entry of stream.follow({
      startSequence: checkpoint,
      endSequence: appended.startSequence + 3n,
      limit: 1,
      timeoutMs: 50,
    })) {
      handled.push(entry.value);
      await writeFile(checkpointPath, String(entry.sequence + 1n));
    }
    assert.deepEqual(handled, events);
    assert.equal(
      BigInt(await readFile(checkpointPath, "utf8")),
      appended.startSequence + 3n,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("typed stream reports codec failures at the stored sequence", async () => {
  const client = new Log({ baseURL });
  const key = uniqueKey("invalid-json");
  const appended = await client.append({
    records: [{ key, value: "not-json" }],
    awaitDurable: true,
  });
  const stream = client.stream(key, jsonCodec<unknown>());
  await assert.rejects(stream.scan(), (error: unknown) => {
    assert.ok(error instanceof ReadError);
    assert.equal(error.operation, "scan");
    assert.ok(error.cause instanceof EventDecodingError);
    assert.equal(error.cause.sequence, appended.startSequence);
    assert.ok(error.cause.cause instanceof SyntaxError);
    return true;
  });
  await assert.rejects(
    stream.follow()[Symbol.asyncIterator]().next(),
    (error: unknown) => {
      assert.ok(error instanceof ReadError);
      assert.equal(error.operation, "follow");
      assert.ok(error.cause instanceof EventDecodingError);
      assert.equal(error.cause.sequence, appended.startSequence);
      assert.ok(error.cause.cause instanceof SyntaxError);
      return true;
    },
  );
});

test(
  "read-only gateway rejects append while serving durable reads",
  { skip: !readOnlyURL },
  async () => {
    const writer = new Log({ baseURL });
    const reader = new Log({ baseURL: readOnlyURL! });
    const key = uniqueKey("read-only");
    const appended = await writer.append({
      records: [{ key, value: "durable" }],
      awaitDurable: true,
    });
    await assert.rejects(
      reader.append({ records: [{ key, value: "must fail" }] }),
      (error: unknown) => {
        httpCause(error, "append", 404);
        return true;
      },
    );

    let values = (await reader.scan({ key })).values;
    const deadline = performance.now() + 10_000;
    while (values.length === 0 && performance.now() < deadline) {
      await delay(100);
      values = (await reader.scan({ key })).values;
    }
    assert.deepEqual(values, [
      { sequence: appended.startSequence, value: encoder.encode("durable") },
    ]);
    assert.deepEqual(await reader.count({ key }), {
      status: "success",
      count: 1n,
    });
    assert.ok((await reader.listSegments()).segments.length > 0);
    assert.ok(
      (await reader.listKeys({ limit: 10_000 })).keys.some(
        ({ key: bytes }) => Buffer.compare(bytes, encoder.encode(key)) === 0,
      ),
    );
  },
);
