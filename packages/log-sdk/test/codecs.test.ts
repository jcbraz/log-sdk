import assert from "node:assert/strict";
import test from "node:test";
import { jsonCodec } from "../src/codecs.js";

test("JSON codec round-trips nested values and UTF-8", (): void => {
  const value = {
    type: "order.created",
    name: "café 🥖",
    data: [1, null, true],
  };
  const codec = jsonCodec<typeof value>();
  assert.deepEqual(codec.decode(codec.encode(value)), value);
});

test("JSON codec validates unknown decoded data", (): void => {
  const codec = jsonCodec((value): number => {
    if (typeof value !== "number") throw new TypeError("Expected a number");
    return value * 2;
  });
  assert.equal(codec.decode(new TextEncoder().encode("3")), 6);
  assert.throws(
    (): number => codec.decode(new TextEncoder().encode('"3"')),
    /Expected a number/,
  );
});

test("JSON codec rejects invalid JSON and malformed UTF-8", (): void => {
  const codec = jsonCodec<unknown>();
  assert.throws(
    (): unknown => codec.decode(new TextEncoder().encode("{")),
    SyntaxError,
  );
  assert.throws(
    (): unknown => codec.decode(new Uint8Array([0x22, 0xff, 0x22])),
    TypeError,
  );
});

test("JSON codec rejects values JSON cannot encode", (): void => {
  const codec = jsonCodec<unknown>();
  assert.throws(
    (): Uint8Array => codec.encode(undefined),
    /cannot be encoded as JSON/,
  );
  assert.throws((): Uint8Array => codec.encode(1n), TypeError);
  const circular: { self?: unknown } = {};
  circular.self = circular;
  assert.throws((): Uint8Array => codec.encode(circular), TypeError);
});
