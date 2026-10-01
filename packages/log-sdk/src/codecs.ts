import type { Codec } from "./types/stream.js";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

/**
 * Encodes UTF-8 JSON. Pass a validator to establish the type of decoded values
 * at runtime; without one, T describes the application's expected schema.
 * @typeParam T - The application value type.
 * @param validate - Optional parser or validator for decoded JSON values.
 * @returns A synchronous codec for UTF-8 JSON values.
 */
export function jsonCodec<T>(validate?: (value: unknown) => T): Codec<T> {
  return {
    encode(value: T): Uint8Array<ArrayBuffer> {
      const incomingJson = JSON.stringify(value);
      const isValidJson = incomingJson !== undefined;
      if (!isValidJson) throw new TypeError("Value cannot be encoded as JSON.");

      return textEncoder.encode(incomingJson);
    },

    decode(bytes: Uint8Array<ArrayBufferLike>): T {
      const incomingJson = textDecoder.decode(bytes);
      const value: unknown = JSON.parse(incomingJson);
      return validate ? validate(value) : (value as T);
    },
  };
}
