import assert from "node:assert/strict";
import test from "node:test";
import { decodeBytes, encodeBytes } from "../src/bytes.js";
import { ProtocolError, ValidationError } from "../src/errors.js";
import {
  decodeAppend,
  decodeCount,
  decodeScan,
  decodeSegments,
  parseJSON,
  sequence,
} from "../src/protocol.js";

test("JSON integer decoding preserves full u64/i64 precision and ignores strings", () => {
  const body = parseJSON(
    '{"status":"success","startSequence":18446744073709551615,"recordsAppended":1,"unknown":"escaped \\\"sequence\\\":9007199254740993"}',
  );
  assert.equal(decodeAppend(body).startSequence, 18446744073709551615n);
  assert.equal(
    decodeCount(parseJSON('{"status":"success","count":9007199254740993}'))
      .count,
    9007199254740993n,
  );
  const segments = decodeSegments(
    parseJSON(
      '{"status":"success","segments":[{"id":4294967295,"startSeq":0,"startTimeMs":-9223372036854775808}]}',
    ),
  );
  assert.equal(segments.segments[0]?.startTimeMs, -9223372036854775808n);
  assert.deepEqual(
    parseJSON(
      '{"string":"12345678901234567890","decimal":1.23,"exponent":1e2}',
    ),
    {
      string: "12345678901234567890",
      decimal: "1.23",
      exponent: "1e2",
    },
  );
  assert.throws(() => parseJSON('{"count":0000000000000001}'), SyntaxError);
  assert.throws(() => parseJSON('{"count":1,"extra":01.0}'), SyntaxError);
  assert.throws(() => parseJSON('{"count":1,"extra":01e2}'), SyntaxError);
});

test("integer metadata rejects fractional or exponent tokens before they can round", () => {
  for (const token of [
    "0.99999999999999999",
    "9007199254740991.49",
    "1e-400",
    "1.0",
    "1e2",
  ]) {
    assert.throws(
      () => decodeCount(parseJSON(`{"status":"success","count":${token}}`)),
      ProtocolError,
    );
    assert.throws(
      () =>
        decodeScan(
          parseJSON(
            `{"status":"success","key":"","values":[{"sequence":${token},"value":""}]}`,
          ),
        ),
      ProtocolError,
    );
  }
});

test("numeric metadata rejects runtimes without original JSON source text", () => {
  const nativeParse = JSON.parse;
  JSON.parse = (text, reviver) =>
    nativeParse(text, (key, value) => (reviver ? reviver(key, value) : value));
  try {
    for (const token of ["0", "9007199254740993", "0.99999999999999999"]) {
      assert.throws(() => parseJSON(`{"status":"success","count":${token}}`), {
        name: "ProtocolError",
        message: /JSON number source text/,
      });
    }
  } finally {
    JSON.parse = nativeParse;
  }
});

test("unsigned inputs reject unsafe numbers, fractions and overflow", () => {
  assert.equal(sequence(42, "cursor"), 42n);
  assert.equal(
    sequence(18446744073709551615n, "cursor"),
    18446744073709551615n,
  );
  for (const value of [
    Number.MAX_SAFE_INTEGER + 1,
    1.2,
    Infinity,
    NaN,
    -1,
    -1n,
    18446744073709551616n,
  ]) {
    assert.throws(() => sequence(value, "cursor"), ValidationError);
  }
});

test("response schemas reject partial, malformed, imprecise and out-of-range data", () => {
  for (const response of [
    null,
    [],
    { status: "error" },
    { status: "success" },
    { status: "success", recordsAppended: 1, startSequence: -1 },
    {
      status: "success",
      recordsAppended: 1,
      startSequence: Number.MAX_SAFE_INTEGER + 1,
    },
    {
      status: "success",
      recordsAppended: 1,
      startSequence: "18446744073709551616",
    },
  ]) {
    assert.throws(() => decodeAppend(response), ProtocolError);
  }
  assert.throws(
    () =>
      decodeScan({
        status: "success",
        key: "YQ==",
        values: [{ sequence: 1, value: "invalid!" }],
      }),
    ProtocolError,
  );
  assert.throws(
    () =>
      decodeSegments({
        status: "success",
        segments: [{ id: 0, startSeq: 0, startTimeMs: "9223372036854775808" }],
      }),
    ProtocolError,
  );
});

test("scan supports current and legacy cursors without losing integer precision", () => {
  const response = decodeScan(
    parseJSON(
      '{"status":"success","key":"YQ==","values":[{"sequence":9007199254740993,"value":"AAH/"}],"nextSequence":9007199254740994}',
    ),
  );
  assert.equal(response.nextSequence, 9007199254740994n);
  assert.deepEqual(response.values, [
    { sequence: 9007199254740993n, value: new Uint8Array([0, 1, 255]) },
  ]);
  assert.equal(
    decodeScan({ status: "success", key: "", values: [] }).nextSequence,
    undefined,
  );
});

test("byte encoding round-trips UTF-8, arbitrary bytes, slices and large payloads", () => {
  const bytes = new Uint8Array(50_000).map((_, index) => index % 256);
  assert.deepEqual(
    decodeBytes(encodeBytes(bytes.subarray(3, 40000)), "value"),
    bytes.subarray(3, 40000),
  );
  const text = "café 🧪\u0000";
  assert.deepEqual(
    decodeBytes(encodeBytes(text), "value"),
    new TextEncoder().encode(text),
  );
  assert.deepEqual(decodeBytes("", "value"), new Uint8Array());
  assert.throws(() => decodeBytes("a", "value"), ProtocolError);
  assert.throws(() => decodeBytes("AA-_", "value"), ProtocolError);
  assert.throws(() => decodeBytes("AB==", "value"), ProtocolError);
});

test("native and browser encoders agree on Unicode, invalid surrogates and byte slices", () => {
  const nativeBuffer = globalThis.Buffer;
  const inputs = [
    "",
    "你好 👋 café\u0000",
    "\ud800unpaired\udfff",
    "🧪".repeat(10_000),
    new Uint8Array([99, 0, 255, 128, 99]).subarray(1, 4),
  ];
  const expected = inputs.map((input) => {
    const bytes =
      typeof input === "string" ? new TextEncoder().encode(input) : input;
    return { bytes, base64: nativeBuffer.from(bytes).toString("base64") };
  });

  try {
    for (const hasBuffer of [true, false]) {
      globalThis.Buffer = hasBuffer
        ? nativeBuffer
        : (undefined as unknown as typeof Buffer);
      inputs.forEach((input, index) => {
        const result = expected[index]!;
        assert.equal(encodeBytes(input), result.base64);
        assert.deepEqual(decodeBytes(result.base64, "value"), result.bytes);
      });
      assert.throws(
        () => encodeBytes(null as unknown as Uint8Array),
        ValidationError,
      );
    }
  } finally {
    globalThis.Buffer = nativeBuffer;
  }
});

test("large valid scan payloads decode without regexp stack overflow", () => {
  const encoded = "A".repeat(16 * 1024 * 1024);
  const response = decodeScan(
    parseJSON(
      `{"status":"success","key":"","values":[{"sequence":0,"value":"${encoded}"}],"nextSequence":1}`,
    ),
  );
  assert.equal(response.values[0]?.value.length, (encoded.length * 3) / 4);
});
