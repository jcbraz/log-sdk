import assert from "node:assert/strict";
import test from "node:test";
import {
  AbortError,
  AppendError,
  type AppendOutcome,
  type AppendRequest,
  ConnectionError,
  type CountResponse,
  HttpError,
  type ListKeysResponse,
  type ListSegmentsResponse,
  Log,
  type LogError,
  OperationError,
  ProtocolError,
  ReadError,
  type ReadOperation,
  type ScanResponse,
  TimeoutError,
  ValidationError,
} from "../src/index.js";

const appendResult = {
  status: "success",
  recordsAppended: 1,
  startSequence: 0,
};
const baseURL = "http://localhost:8080/proxy/";

type ErrorClass<T extends LogError> = abstract new (...args: never[]) => T;
type SentRecord = { key: string; value: string };
type FetchFailure = { fetch: typeof fetch; Cause: ErrorClass<LogError> };

function readFailure<T extends LogError>({
  operation,
  Cause,
  inspect,
}: {
  operation: ReadOperation;
  Cause: ErrorClass<T>;
  inspect?: (cause: T) => void;
}): (error: unknown) => boolean {
  return (error): boolean => {
    assert.ok(error instanceof ReadError);
    assert.equal(error.operation, operation);
    assert.ok(error.cause instanceof Cause);
    assert.ok(!(error.cause instanceof OperationError));
    inspect?.(error.cause);
    return true;
  };
}

function appendFailure<T extends LogError>({
  outcome,
  Cause,
  inspect,
}: {
  outcome: AppendOutcome;
  Cause: ErrorClass<T>;
  inspect?: (cause: T) => void;
}): (error: unknown) => boolean {
  return (error): boolean => {
    assert.ok(error instanceof AppendError);
    assert.equal(error.operation, "append");
    assert.equal(error.outcome, outcome);
    assert.ok(error.cause instanceof Cause);
    assert.ok(!(error.cause instanceof OperationError));
    inspect?.(error.cause);
    return true;
  };
}

test("client encodes records, preserves proxy prefix and applies authentication headers", async (): Promise<void> => {
  const client = new Log({
    baseURL,
    headers: { Authorization: "Bearer test" },
    fetch: async (input, init): Promise<Response> => {
      assert.equal(input.toString(), `${baseURL}api/v1/log/append`);
      assert.equal(init?.method, "POST");
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        "Bearer test",
      );
      assert.equal(
        new Headers(init?.headers).get("content-type"),
        "application/json",
      );
      assert.deepEqual(JSON.parse(String(init?.body)), {
        records: [{ key: "Y2Fmw6k=", value: "AP8=" }],
        awaitDurable: true,
      });
      return Response.json(appendResult);
    },
  });
  assert.deepEqual(
    await client.append({
      records: [{ key: "café", value: new Uint8Array([0, 255]) }],
      awaitDurable: true,
    }),
    {
      status: "success",
      recordsAppended: 1,
      startSequence: 0n,
    },
  );
});

test("client maps all query names including zero and false", async (): Promise<void> => {
  const urls: URL[] = [];
  const client = new Log({
    baseURL,
    fetch: async (input): Promise<Response> => {
      const url = new URL(input.toString());
      urls.push(url);
      if (url.pathname.endsWith("scan"))
        return Response.json({
          status: "success",
          key: "",
          values: [],
          nextSequence: 0,
        });
      if (url.pathname.endsWith("count"))
        return Response.json({ status: "success", count: 0 });
      if (url.pathname.endsWith("keys"))
        return Response.json({ status: "success", keys: [] });
      return Response.json({ status: "success", segments: [] });
    },
  });
  await client.scan({
    key: "a &+?🧪",
    startSequence: 0n,
    endSequence: 18446744073709551615n,
    limit: 0,
    follow: false,
    timeoutMs: 0,
  });
  assert.deepEqual(Object.fromEntries(urls[0]?.searchParams ?? []), {
    key: "a &+?🧪",
    start_seq: "0",
    end_seq: "18446744073709551615",
    limit: "0",
    follow: "false",
    timeout_ms: "0",
  });
  await client.count({ key: "a", startSequence: 0, endSequence: 1 });
  await client.listKeys({ startSegment: 0, endSegment: 2, limit: 0 });
  await client.listSegments({ startSequence: 0, endSequence: 1 });
  assert.equal(urls[1]?.searchParams.get("end_seq"), "1");
  assert.equal(urls[2]?.searchParams.get("start_segment"), "0");
  assert.equal(urls[3]?.searchParams.get("start_seq"), "0");
});

test("HTTP errors retain JSON, plain text, empty bodies and headers", async (): Promise<void> => {
  for (const body of [
    '{"status":"error","message":"Invalid input: missing value"}',
    "Bad proxy",
    "",
  ]) {
    const client = new Log({
      baseURL,
      fetch: async (): Promise<Response> =>
        new Response(body, {
          status: 400,
          headers: { "x-request-id": "trace" },
        }),
    });
    await assert.rejects(
      client.count({ key: "a" }),
      readFailure({
        operation: "count",
        Cause: HttpError,
        inspect: (cause): void => {
          assert.equal(cause.status, 400);
          assert.equal(cause.method, "GET");
          assert.equal(cause.headers.get("x-request-id"), "trace");
          assert.ok(cause.message.length > 0);
          assert.deepEqual(
            cause.body,
            body.startsWith("{") ? JSON.parse(body) : body,
          );
        },
      }),
    );
  }
});

test("appends preserve repeated, changing and mutable keys across batches", async (): Promise<void> => {
  const sent: SentRecord[][] = [];
  const client = new Log({
    baseURL,
    fetch: async (_input, init): Promise<Response> => {
      const body = JSON.parse(String(init?.body));
      sent.push(body.records.map(decodeSentRecord));
      return Response.json({
        ...appendResult,
        recordsAppended: body.records.length,
      });
    },
  });
  const keys = ["", "", "你好/🧪", "你好/🧪", "orders", "", "orders"];
  const records = keys.map((key): SentRecord => ({ key, value: "event" }));
  await client.append({ records });
  await client.append({ records: [{ key: "orders", value: "next event" }] });

  const bytes = new Uint8Array([99, 97, 99]);
  const byteKey = bytes.subarray(1, 2);
  await client.append({ records: [{ key: byteKey, value: "first" }] });
  byteKey[0] = 98;
  await client.append({ records: [{ key: byteKey, value: "second" }] });
  await client.append({ records: [{ key: "orders", value: "last" }] });

  assert.deepEqual(sent, [
    records,
    [{ key: "orders", value: "next event" }],
    [{ key: "a", value: "first" }],
    [{ key: "b", value: "second" }],
    [{ key: "orders", value: "last" }],
  ]);
  await assert.rejects(
    client.append({
      records: [{ key: undefined as unknown as string, value: "invalid" }],
    }),
    appendFailure({ outcome: "not-sent", Cause: ValidationError }),
  );
  assert.equal(sent.length, 5);
});

function decodeSentRecord(record: SentRecord): SentRecord {
  return {
    key: Buffer.from(record.key, "base64").toString("utf8"),
    value: Buffer.from(record.value, "base64").toString("utf8"),
  };
}

test("malformed successful responses are protocol errors", async (): Promise<void> => {
  for (const body of [
    "<html>proxy</html>",
    '{"status":"success","count":"not an integer"}',
  ]) {
    const client = new Log({
      baseURL,
      fetch: async (): Promise<Response> => new Response(body),
    });
    await assert.rejects(
      client.count({ key: "a" }),
      readFailure({ operation: "count", Cause: ProtocolError }),
    );
  }
});

test("connection failures preserve their cause and append never retries", async (): Promise<void> => {
  let requests = 0;
  const cause = new Error("socket reset");
  const client = new Log({
    baseURL,
    fetch: async (): Promise<never> => {
      requests++;
      throw cause;
    },
  });
  await assert.rejects(
    client.append({ records: [{ key: "a", value: "b" }] }),
    appendFailure({
      outcome: "unknown",
      Cause: ConnectionError,
      inspect: (error): void => {
        assert.equal(error.cause, cause);
      },
    }),
  );
  assert.equal(requests, 1);
});

test("timeouts include body reads, while caller cancellation is distinct", async (): Promise<void> => {
  const waitingFetch: typeof fetch = async (
    _input,
    init,
  ): Promise<Response> => {
    const body = new ReadableStream({
      start(controller): void {
        init?.signal?.addEventListener(
          "abort",
          (): void => controller.error(init.signal?.reason),
          { once: true },
        );
      },
    });
    return new Response(body);
  };
  const client = new Log({ baseURL, fetch: waitingFetch });
  await assert.rejects(
    client.count({ key: "a" }, { timeoutMs: 10 }),
    readFailure({ operation: "count", Cause: TimeoutError }),
  );
  const controller = new AbortController();
  const waiting = client.count({ key: "a" }, { signal: controller.signal });
  controller.abort("stop");
  await assert.rejects(
    waiting,
    readFailure({
      operation: "count",
      Cause: AbortError,
      inspect: (cause): void => {
        assert.equal(cause.cause, "stop");
      },
    }),
  );
});

test("validation catches invalid configuration and unsafe numeric inputs before fetch", async (): Promise<void> => {
  for (const invalidURL of [
    "/relative",
    "ftp://localhost",
    "http://a/?token=x",
    "http://user:pass@a/",
    "http://a/#fragment",
  ]) {
    assert.throws((): Log => new Log({ baseURL: invalidURL }), ValidationError);
  }
  assert.throws((): Log => new Log({ baseURL, timeoutMs: 0 }), ValidationError);
  const client = new Log({
    baseURL,
    fetch: async (): Promise<never> => {
      assert.fail("must not fetch");
    },
  });
  await assert.rejects(
    client.scan({ key: "a", startSequence: Number.MAX_SAFE_INTEGER + 1 }),
    readFailure({ operation: "scan", Cause: ValidationError }),
  );
  await assert.rejects(
    client.listKeys({ startSegment: 4294967296 }),
    readFailure({ operation: "listKeys", Cause: ValidationError }),
  );
  await assert.rejects(
    client.scan({ key: "a", limit: -1 }),
    readFailure({ operation: "scan", Cause: ValidationError }),
  );
});

test("operational endpoint results remain text", async (): Promise<void> => {
  const client = new Log({
    baseURL,
    fetch: async (input): Promise<Response> =>
      new Response(new URL(input.toString()).pathname),
  });
  assert.equal(await client.healthy(), "/proxy/-/healthy");
  assert.equal(await client.ready(), "/proxy/-/ready");
  assert.equal(await client.metrics(), "/proxy/metrics");
});

test("every read endpoint identifies its operation and preserves the HTTP diagnosis", async (): Promise<void> => {
  const client = new Log({
    baseURL,
    fetch: async (): Promise<Response> =>
      new Response("service unavailable", { status: 503 }),
  });
  const reads: [ReadOperation, () => Promise<unknown>][] = [
    [
      "scan",
      (): Promise<ScanResponse<Uint8Array>> => client.scan({ key: "orders" }),
    ],
    ["count", (): Promise<CountResponse> => client.count({ key: "orders" })],
    ["listKeys", (): Promise<ListKeysResponse> => client.listKeys()],
    [
      "listSegments",
      (): Promise<ListSegmentsResponse> => client.listSegments(),
    ],
    ["healthy", (): Promise<string> => client.healthy()],
    ["ready", (): Promise<string> => client.ready()],
    ["metrics", (): Promise<string> => client.metrics()],
  ];
  await Promise.all(
    reads.map(
      ([operation, read]): Promise<void> =>
        assert.rejects(
          read(),
          readFailure({
            operation,
            Cause: HttpError,
            inspect: (cause): void => {
              assert.equal(cause.status, 503);
              assert.equal(cause.body, "service unavailable");
            },
          }),
        ),
    ),
  );
});

test("append preflight failures report not-sent and never invoke fetch", async (): Promise<void> => {
  let requests = 0;
  const client = new Log({
    baseURL,
    fetch: async (): Promise<Response> => {
      requests++;
      return Response.json(appendResult);
    },
  });
  const valid = { records: [{ key: "orders", value: "event" }] };
  await assert.rejects(
    client.append({ records: null } as unknown as AppendRequest),
    appendFailure({ outcome: "not-sent", Cause: ValidationError }),
  );
  await assert.rejects(
    client.append({
      records: [{ key: "orders", value: null as unknown as Uint8Array }],
    }),
    appendFailure({ outcome: "not-sent", Cause: ValidationError }),
  );
  await assert.rejects(
    client.append(valid, { timeoutMs: 0 }),
    appendFailure({ outcome: "not-sent", Cause: ValidationError }),
  );
  const controller = new AbortController();
  const reason = new Error("shutdown before dispatch");
  controller.abort(reason);
  await assert.rejects(
    client.append(valid, { signal: controller.signal }),
    appendFailure({
      outcome: "not-sent",
      Cause: AbortError,
      inspect: (cause): void => {
        assert.equal(cause.cause, reason);
      },
    }),
  );
  assert.equal(requests, 0);
});

test("append failures after fetch invocation have unknown outcomes and never retry", async (): Promise<void> => {
  await Promise.all(
    appendFetchFailures().map(
      async ({ fetch: failure, Cause }): Promise<void> => {
        let requests = 0;
        const client = new Log({
          baseURL,
          fetch: (input, init): Promise<Response> => {
            requests++;
            return failure(input, init);
          },
        });
        await assert.rejects(
          client.append({ records: [{ key: "orders", value: "event" }] }),
          appendFailure({ outcome: "unknown", Cause }),
        );
        assert.equal(requests, 1);
      },
    ),
  );
});

function appendFetchFailures(): FetchFailure[] {
  return [
    {
      fetch: (): never => {
        throw new Error("synchronous custom fetch failure");
      },
      Cause: ConnectionError,
    },
    {
      fetch: async (): Promise<never> => {
        throw new Error("socket reset");
      },
      Cause: ConnectionError,
    },
    ...[400, 500].map(
      (status): FetchFailure => ({
        fetch: async (): Promise<Response> =>
          new Response("append failed", { status }),
        Cause: HttpError,
      }),
    ),
    {
      fetch: async (): Promise<Response> => new Response("malformed success"),
      Cause: ProtocolError,
    },
    {
      fetch: async (): Promise<Response> =>
        new Response(
          new ReadableStream({
            start(controller): void {
              controller.error(new Error("response stream failed"));
            },
          }),
        ),
      Cause: ConnectionError,
    },
  ];
}

test("append timeout and in-flight cancellation retain unknown outcomes", async (): Promise<void> => {
  let requests = 0;
  const client = new Log({
    baseURL,
    fetch: async (_input, init): Promise<Response> => {
      requests++;
      return new Response(
        new ReadableStream({
          start(controller): void {
            init?.signal?.addEventListener(
              "abort",
              (): void => controller.error(init.signal?.reason),
              { once: true },
            );
          },
        }),
      );
    },
  });
  const request = { records: [{ key: "orders", value: "event" }] };
  await assert.rejects(
    client.append(request, { timeoutMs: 10 }),
    appendFailure({ outcome: "unknown", Cause: TimeoutError }),
  );
  const controller = new AbortController();
  const reason = new Error("shutdown after dispatch");
  const pending = client.append(request, { signal: controller.signal });
  controller.abort(reason);
  await assert.rejects(
    pending,
    appendFailure({
      outcome: "unknown",
      Cause: AbortError,
      inspect: (cause): void => {
        assert.equal(cause.cause, reason);
      },
    }),
  );
  assert.equal(requests, 2);
});

test("an injected fetch cannot replace this append's dispatch outcome with another operation's error", async (): Promise<void> => {
  const foreignFailure = new AppendError({
    outcome: "not-sent",
    cause: new ValidationError("another append was rejected locally"),
  });
  const client = new Log({
    baseURL,
    fetch: async (): Promise<never> => {
      throw foreignFailure;
    },
  });
  await assert.rejects(
    client.append({ records: [{ key: "orders", value: "event" }] }),
    appendFailure({
      outcome: "unknown",
      Cause: ConnectionError,
      inspect: (cause): void => {
        assert.equal(cause.cause, foreignFailure);
      },
    }),
  );
});

test("transient read failures make exactly one request", async (): Promise<void> => {
  const failures: { fetch: typeof fetch; Cause: ErrorClass<LogError> }[] = [
    ...[408, 429, 500, 502, 503, 504].map(
      (
        status,
      ): { fetch: () => Promise<Response>; Cause: typeof HttpError } => ({
        fetch: async (): Promise<Response> =>
          new Response("busy", { status, headers: { "retry-after": "0" } }),
        Cause: HttpError,
      }),
    ),
    {
      fetch: async (): Promise<never> => {
        throw new Error("connection lost");
      },
      Cause: ConnectionError,
    },
  ];
  await Promise.all(
    failures.map(async ({ fetch: fail, Cause }): Promise<void> => {
      let requests = 0;
      const client = new Log({
        baseURL,
        fetch: (input, init): Promise<Response> => {
          requests++;
          return fail(input, init);
        },
      });
      await assert.rejects(
        client.count({ key: "orders" }),
        readFailure({ operation: "count", Cause }),
      );
      assert.equal(requests, 1);
    }),
  );
});

test("composed operations keep each client's configuration when passed as callbacks", async (): Promise<void> => {
  function configuredLog(name: string): Log {
    return new Log({
      baseURL: `http://localhost/${name}/`,
      headers: { Authorization: name },
      fetch: async (input, init): Promise<Response> => {
        const url = new URL(input.toString());
        assert.equal(url.pathname, `/${name}/api/v1/log/count`);
        assert.equal(url.searchParams.get("key"), "orders");
        assert.equal(new Headers(init?.headers).get("Authorization"), name);
        return Response.json({
          status: "success",
          count: name === "first" ? 1 : 2,
        });
      },
    });
  }

  const first = configuredLog("first");
  const second = configuredLog("second");
  const counts = await Promise.all(
    [first.count, second.count].map(
      (count): Promise<CountResponse> => count({ key: "orders" }),
    ),
  );
  assert.deepEqual(
    counts.map((result): bigint => result.count),
    [1n, 2n],
  );
});

test("completed and failed requests release their deadline and caller abort listener", async (): Promise<void> => {
  const controller = new AbortController();
  const requestSignals: AbortSignal[] = [];
  const responses = [
    (): Response => Response.json({ status: "success", count: 1 }),
    (): Response => new Response("rejected", { status: 400 }),
    (): Response => new Response("invalid JSON"),
    (): Response =>
      Response.json({ status: "success", count: "invalid count" }),
    (): never => {
      throw new Error("connection failed");
    },
    (): Response =>
      new Response(
        new ReadableStream({
          start(stream): void {
            stream.error(new Error("body failed"));
          },
        }),
      ),
  ];
  const results = await Promise.allSettled(
    responses.map((response): Promise<CountResponse> => {
      const client = new Log({
        baseURL,
        timeoutMs: 50,
        fetch: async (_input, init): Promise<Response> => {
          assert.ok(init?.signal);
          requestSignals.push(init.signal);
          return response();
        },
      });
      return client.count({ key: "orders" }, { signal: controller.signal });
    }),
  );
  assert.deepEqual(
    results.map((result): "fulfilled" | "rejected" => result.status),
    ["fulfilled", "rejected", "rejected", "rejected", "rejected", "rejected"],
  );

  controller.abort("caller finished");
  assert.ok(requestSignals.every((signal): boolean => !signal.aborted));
  await new Promise((resolve): void => {
    setTimeout(resolve, 60);
  });
  assert.ok(requestSignals.every((signal): boolean => !signal.aborted));
});
