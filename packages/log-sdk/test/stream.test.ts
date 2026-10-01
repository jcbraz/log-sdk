import assert from "node:assert/strict";
import test from "node:test";
import { Log } from "../src/client/index.js";
import { jsonCodec } from "../src/codecs.js";
import {
  AbortError,
  AppendError,
  EventDecodingError,
  EventEncodingError,
  HttpError,
  LogError,
  OperationError,
  ProtocolError,
  ReadError,
  ValidationError,
} from "../src/errors.js";
import { LogStream } from "../src/stream/index.js";
import type {
  AppendRequest,
  RequestOptions,
  ScanRequest,
  ScanResponse,
} from "../src/types/index.js";

const key = new TextEncoder().encode("orders");
const codec = jsonCodec<{ id: string }>();
const appendResponse = {
  status: "success",
  recordsAppended: 1,
  startSequence: 3n,
} as const;

test("stream methods retain their key and codec when passed as callbacks", async () => {
  const transport = client(async (input) => {
    assert.equal(input.key, "orders");
    return page([{ sequence: 3n, id: "one" }], 4n);
  });
  transport.append = async (input) => {
    assert.deepEqual(input.records, [
      { key: "orders", value: codec.encode({ id: "one" }) },
    ]);
    return appendResponse;
  };
  const stream = new LogStream(transport, "orders", codec);
  const { append, scan, follow } = stream;

  assert.equal(await append({ values: [{ id: "one" }] }), appendResponse);
  const expected = [{ sequence: 3n, value: { id: "one" } }];
  assert.deepEqual((await scan()).values, expected);
  const entries = [];
  for await (const entry of follow({ startSequence: 3n, endSequence: 4n }))
    entries.push(entry);
  assert.deepEqual(entries, expected);
});

function page(
  values: { sequence: bigint; id: string }[],
  nextSequence?: bigint,
): ScanResponse {
  return {
    status: "success",
    key,
    values: values.map(({ sequence, id }) => ({
      sequence,
      value: codec.encode({ id }),
    })),
    ...(nextSequence === undefined ? {} : { nextSequence }),
  };
}

function client(scan: Log["scan"]): Pick<Log, "append" | "scan"> {
  return { append: async () => appendResponse, scan };
}

function readFailure<T extends LogError>(
  operation: "scan" | "follow",
  Cause: abstract new (...args: never[]) => T,
  inspect?: (cause: T) => void,
): (error: unknown) => boolean {
  return (error) => {
    assert.ok(error instanceof ReadError);
    assert.equal(error.operation, operation);
    assert.ok(error.cause instanceof Cause);
    assert.ok(!(error.cause instanceof OperationError));
    inspect?.(error.cause);
    return true;
  };
}

test("stream append encodes each value and forwards durability and request options", async () => {
  let request: AppendRequest | undefined;
  let options: RequestOptions | undefined;
  const transport = client(async () => page([]));
  transport.append = async (input, requestOptions) => {
    request = input;
    options = requestOptions;
    return appendResponse;
  };
  const stream = new LogStream(transport, "orders", codec);
  const requestOptions = {
    signal: new AbortController().signal,
    timeoutMs: 500,
  };
  const response = await stream.append(
    { values: [{ id: "one" }, { id: "two" }], awaitDurable: true },
    requestOptions,
  );
  assert.equal(response, appendResponse);
  assert.equal(options, requestOptions);
  assert.deepEqual(request, {
    records: [
      { key: "orders", value: codec.encode({ id: "one" }) },
      { key: "orders", value: codec.encode({ id: "two" }) },
    ],
    awaitDurable: true,
  });
});

test("stream scan decodes values and preserves the raw response metadata", async () => {
  let request: ScanRequest | undefined;
  let options: RequestOptions | undefined;
  const stream = new LogStream(
    client(async (input, requestOptions) => {
      request = input;
      options = requestOptions;
      return page([{ sequence: 7n, id: "one" }], 9n);
    }),
    "orders",
    codec,
  );
  const requestOptions = { timeoutMs: 500 };
  const response = await stream.scan(
    { startSequence: 7n, endSequence: 20n, limit: 1 },
    requestOptions,
  );
  assert.deepEqual(request, {
    key: "orders",
    startSequence: 7n,
    endSequence: 20n,
    limit: 1,
  });
  assert.equal(options, requestOptions);
  assert.equal(response.key, key);
  assert.equal(response.nextSequence, 9n);
  assert.deepEqual(response.values, [{ sequence: 7n, value: { id: "one" } }]);
});

test("stream wraps codec errors without losing their cause", async () => {
  const encodingFailure = new Error("Encoding failed");
  const decodingFailure = new Error("Decoding failed");
  const stream = new LogStream<string>(
    client(async () => page([{ sequence: 7n, id: "one" }])),
    "orders",
    {
      encode: (value) => {
        if (value === "bad") throw encodingFailure;
        return new TextEncoder().encode(value);
      },
      decode: () => {
        throw decodingFailure;
      },
    },
  );
  await assert.rejects(
    stream.append({ values: ["event", "bad"] }),
    (error: unknown) => {
      assert.ok(error instanceof AppendError);
      assert.equal(error.operation, "append");
      assert.equal(error.outcome, "not-sent");
      assert.ok(error.cause instanceof EventEncodingError);
      assert.ok(error.cause instanceof ValidationError);
      assert.equal(error.cause.index, 1);
      assert.equal(error.cause.cause, encodingFailure);
      return true;
    },
  );
  await assert.rejects(
    stream.scan(),
    readFailure("scan", EventDecodingError, (cause) => {
      assert.ok(cause instanceof ProtocolError);
      assert.match(cause.message, /sequence 7/);
      assert.equal(cause.sequence, 7n);
      assert.equal(cause.cause, decodingFailure);
    }),
  );
  await assert.rejects(
    stream.follow()[Symbol.asyncIterator]().next(),
    readFailure("follow", EventDecodingError, (cause) => {
      assert.equal(cause.sequence, 7n);
      assert.equal(cause.cause, decodingFailure);
    }),
  );
});

test("follow requests pages only after the consumer exhausts the current page", async () => {
  const requests: ScanRequest[] = [];
  const options: (RequestOptions | undefined)[] = [];
  const pages = [
    page(
      [
        { sequence: 3n, id: "one" },
        { sequence: 10n, id: "two" },
      ],
      11n,
    ),
    page([], 20n),
  ];
  const stream = new LogStream(
    client(async (input, requestOptions) => {
      requests.push(input);
      options.push(requestOptions);
      return pages.shift()!;
    }),
    "orders",
    codec,
  );
  const iterator = stream.follow({ endSequence: 20n })[Symbol.asyncIterator]();
  assert.deepEqual(await iterator.next(), {
    done: false,
    value: { sequence: 3n, value: { id: "one" } },
  });
  assert.equal(requests.length, 1);
  assert.deepEqual(await iterator.next(), {
    done: false,
    value: { sequence: 10n, value: { id: "two" } },
  });
  assert.equal(requests.length, 1);
  assert.equal((await iterator.next()).done, true);
  assert.deepEqual(
    requests.map((request) => request.startSequence),
    [0n, 11n],
  );
  assert.deepEqual(requests[0], {
    key: "orders",
    startSequence: 0n,
    endSequence: 20n,
    limit: 100,
    follow: true,
    timeoutMs: 30_000,
  });
  assert.deepEqual(options[0], { timeoutMs: 35_000 });
});

test("follow falls back to last sequence + 1 for older servers and tolerates sequence gaps", async () => {
  const requests: ScanRequest[] = [];
  const pages = [
    page([
      { sequence: 3n, id: "one" },
      { sequence: 8n, id: "two" },
    ]),
    page([{ sequence: 10n, id: "three" }]),
  ];
  const stream = new LogStream(
    client(async (input) => {
      requests.push(input);
      return pages.shift()!;
    }),
    "orders",
    codec,
  );
  const entries = [];
  for await (const entry of stream.follow({ endSequence: 11n }))
    entries.push(entry);
  assert.deepEqual(
    entries.map((entry) => entry.sequence),
    [3n, 8n, 10n],
  );
  assert.deepEqual(
    requests.map((request) => request.startSequence),
    [0n, 9n],
  );
});

test("follow advances an empty page's cursor before asking for more entries", async () => {
  const requests: ScanRequest[] = [];
  const pages = [page([], 10n), page([{ sequence: 10n, id: "one" }], 11n)];
  const stream = new LogStream(
    client(async (input) => {
      requests.push(input);
      return pages.shift()!;
    }),
    "orders",
    codec,
  );
  const entries = [];
  for await (const entry of stream.follow({
    endSequence: 11n,
    pollIntervalMs: 1,
  }))
    entries.push(entry);
  assert.equal(entries.length, 1);
  assert.deepEqual(
    requests.map((request) => request.startSequence),
    [0n, 10n],
  );
});

test("follow aborts promptly during an old server's idle poll delay", async () => {
  const controller = new AbortController();
  let calls = 0;
  const stream = new LogStream(
    client(async () => {
      calls += 1;
      setTimeout(() => controller.abort("shutdown"), 5);
      return page([]);
    }),
    "orders",
    codec,
  );
  const iterator = stream
    .follow({ signal: controller.signal, pollIntervalMs: 60_000 })
    [Symbol.asyncIterator]();
  await assert.rejects(
    iterator.next(),
    readFailure("follow", AbortError, (cause) => {
      assert.equal(cause.cause, "shutdown");
    }),
  );
  assert.equal(calls, 1);
});

test("follow rejects non-advancing cursors and invalid input before polling", async () => {
  const stream = new LogStream(
    client(async () => page([{ sequence: 7n, id: "one" }], 7n)),
    "orders",
    codec,
  );
  await assert.rejects(
    stream.follow()[Symbol.asyncIterator]().next(),
    readFailure("follow", ProtocolError),
  );
  const invalidInputs = [
    { startSequence: Number.MAX_SAFE_INTEGER + 1 },
    { startSequence: 2n, endSequence: 1n },
    { limit: 0 },
    { timeoutMs: -1 },
    { pollIntervalMs: 0 },
  ];
  for (const input of invalidInputs) {
    await assert.rejects(
      stream.follow(input)[Symbol.asyncIterator]().next(),
      readFailure("follow", ValidationError),
    );
  }
});

test("follow does not request an exhausted range or a pre-aborted signal", async () => {
  let calls = 0;
  const stream = new LogStream(
    client(async () => {
      calls += 1;
      return page([]);
    }),
    "orders",
    codec,
  );
  assert.equal(
    (
      await stream
        .follow({ startSequence: 5n, endSequence: 5n })
        [Symbol.asyncIterator]()
        .next()
    ).done,
    true,
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    stream.follow({ signal: controller.signal })[Symbol.asyncIterator]().next(),
    readFailure("follow", AbortError),
  );
  assert.equal(calls, 0);
});

test("stream validates its UTF-8 key and scan sequence order and bounds", async () => {
  const transport = client(async () => page([]));
  // JavaScript callers can bypass the TypeScript contract.
  assert.throws(
    () =>
      new LogStream(transport, new Uint8Array() as unknown as string, codec),
    ValidationError,
  );
  const cases = [
    {
      response: page([
        { sequence: 3n, id: "one" },
        { sequence: 2n, id: "two" },
      ]),
      startSequence: 0n,
    },
    { response: page([{ sequence: 4n, id: "one" }]), startSequence: 5n },
    { response: page([{ sequence: 10n, id: "one" }]), startSequence: 5n },
  ];
  for (const { response, startSequence } of cases) {
    const stream = new LogStream(
      client(async () => response),
      "orders",
      codec,
    );
    await assert.rejects(
      stream.scan({ startSequence, endSequence: 10n }),
      readFailure("scan", ProtocolError),
    );
  }
});

test("follow preserves cursor precision beyond the JavaScript safe integer range", async () => {
  const start = BigInt(Number.MAX_SAFE_INTEGER) + 10n;
  const requests: ScanRequest[] = [];
  const stream = new LogStream(
    client(async (input) => {
      requests.push(input);
      return page([{ sequence: start + 2n, id: "one" }]);
    }),
    "orders",
    codec,
  );
  const entries = [];
  for await (const entry of stream.follow({
    startSequence: start,
    endSequence: start + 3n,
  }))
    entries.push(entry);
  assert.deepEqual(
    entries.map((entry) => entry.sequence),
    [start + 2n],
  );
  assert.equal(requests[0]?.startSequence, start);
});

test("stream rejects another key's response before invoking its codec", async () => {
  let decodes = 0;
  const countedCodec = {
    ...codec,
    decode(bytes: Uint8Array) {
      decodes += 1;
      return codec.decode(bytes);
    },
  };
  for (const otherKey of ["another-stream", "orderz"]) {
    const response = {
      ...page([{ sequence: 1n, id: "one" }]),
      key: new TextEncoder().encode(otherKey),
    };
    const stream = new LogStream(
      client(async () => response),
      "orders",
      countedCodec,
    );
    await assert.rejects(
      stream.scan(),
      readFailure("scan", ProtocolError, (cause) => {
        assert.match(cause.message, /different stream key/);
      }),
    );
  }
  assert.equal(decodes, 0);
});

test("stream reads preserve the diagnosis while follow changes the operation context", async () => {
  const source = new Log({
    baseURL: "http://localhost:8080",
    fetch: async () => new Response("upstream unavailable", { status: 503 }),
  });
  const original = await source.scan({ key: "orders" }).then(
    () => assert.fail("scan must fail"),
    (error: unknown) => error,
  );
  assert.ok(original instanceof ReadError);
  assert.ok(original.cause instanceof HttpError);
  const stream = new LogStream(
    client(async () => {
      throw original;
    }),
    "orders",
    codec,
  );
  await assert.rejects(stream.scan(), (error: unknown) => {
    assert.equal(error, original);
    return true;
  });
  await assert.rejects(
    stream.follow()[Symbol.asyncIterator]().next(),
    readFailure("follow", HttpError, (cause) => {
      assert.equal(cause, original.cause);
      assert.equal(cause.body, "upstream unavailable");
    }),
  );
});

test("stream append preserves the delegated append's outcome and error identity", async () => {
  const source = new Log({
    baseURL: "http://localhost:8080",
    fetch: async () => new Response("append failed", { status: 500 }),
  });
  const request = { records: [{ key: "orders", value: "event" }] };
  const failures = await Promise.all(
    [source.append(request), source.append(request, { timeoutMs: 0 })].map(
      (append) =>
        append.then(
          () => assert.fail("append must fail"),
          (error: unknown) => error,
        ),
    ),
  );
  for (const original of failures) {
    assert.ok(original instanceof AppendError);
    const transport = client(async () => page([]));
    transport.append = async () => {
      throw original;
    };
    const stream = new LogStream(transport, "orders", codec);
    await assert.rejects(
      stream.append({ values: [{ id: "one" }] }),
      (error: unknown) => {
        assert.equal(error, original);
        assert.equal(
          original.outcome,
          original.cause instanceof HttpError ? "unknown" : "not-sent",
        );
        return true;
      },
    );
  }
});

test("a custom stream transport failure after delegation cannot claim not-sent", async () => {
  const failure = new Error("custom transport lost its response");
  const transport = client(async () => page([]));
  transport.append = async () => {
    throw failure;
  };
  const stream = new LogStream(transport, "orders", codec);
  await assert.rejects(
    stream.append({ values: [{ id: "one" }] }),
    (error: unknown) => {
      assert.ok(error instanceof AppendError);
      assert.equal(error.outcome, "unknown");
      assert.ok(error.cause instanceof LogError);
      assert.equal(error.cause.cause, failure);
      return true;
    },
  );
});

test("a codec failure preserves a thrown value and prevents dispatch", async () => {
  let appends = 0;
  const transport = client(async () => page([]));
  transport.append = async () => {
    appends++;
    return appendResponse;
  };
  const failure = { reason: "invalid event" };
  const stream = new LogStream(transport, "orders", {
    ...codec,
    encode: () => {
      throw failure;
    },
  });
  await assert.rejects(
    stream.append({ values: [{ id: "one" }] }),
    (error: unknown) => {
      assert.ok(error instanceof AppendError);
      assert.equal(error.outcome, "not-sent");
      assert.ok(error.cause instanceof EventEncodingError);
      assert.equal(error.cause.index, 0);
      assert.equal(error.cause.cause, failure);
      return true;
    },
  );
  assert.equal(appends, 0);
});
