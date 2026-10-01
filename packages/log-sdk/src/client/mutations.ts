import { encodeBytes } from "../bytes.js";
import { ValidationError } from "../errors.js";
import { decodeAppend } from "../protocol.js";
import { runAppend } from "../shared.js";
import type {
  AppendRequest,
  AppendResponse,
  BytesInput,
} from "../types/records.js";
import type { RequestOptions } from "../types/client.js";
import type { Request } from "./request.js";

export function createAppend(request: Request) {
  // Retain only the latest text key; byte keys can be mutated by the caller.
  let cachedKey: { value: string; encoded: string } | undefined;

  return function append(
    input: AppendRequest,
    options?: RequestOptions,
  ): Promise<AppendResponse> {
    return runAppend((markDispatched) => {
      const isValidRecordsArray = Array.isArray(input.records);
      if (!isValidRecordsArray)
        throw new ValidationError("Appended Records must be a valid Array!");

      const records = input.records.map((record) => ({
        key: encodeKey(record?.key),
        value: encodeBytes(record?.value),
      }));

      const appendRecordsBody = JSON.stringify({
        records,
        awaitDurable: input.awaitDurable ?? false,
      });

      return request({
        path: "api/v1/log/append",
        method: "POST",
        body: appendRecordsBody,
        options,
        onDispatch: markDispatched,
        decode: decodeAppend,
      });
    });
  };

  function encodeKey(value: BytesInput): string {
    const isText = typeof value === "string";
    if (!isText) return encodeBytes(value);
    if (cachedKey?.value === value) return cachedKey.encoded;

    const encoded = encodeBytes(value);
    cachedKey = { value, encoded };
    return encoded;
  }
}
