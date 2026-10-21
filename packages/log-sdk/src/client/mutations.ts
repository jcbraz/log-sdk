import { encodeBytes } from "../bytes.js";
import { ValidationError } from "../errors.js";
import { decodeAppend } from "../protocol.js";
import { runAppend } from "../shared.js";
import type { RequestOptions } from "../types/client.js";
import type {
  AppendRequest,
  AppendResponse,
  BytesInput,
} from "../types/records.js";
import type { Request } from "./request.js";
import type { AppendOperation, EncodedRecord } from "./types.js";

export function createAppend(request: Request): AppendOperation {
  let latestTextKey: { value: string; encoded: string } | undefined;

  return function append(
    input: AppendRequest,
    options?: RequestOptions,
  ): Promise<AppendResponse> {
    return runAppend((markDispatched): Promise<AppendResponse> => {
      const isValidRecordsArray = Array.isArray(input.records);
      if (!isValidRecordsArray)
        throw new ValidationError("Appended Records must be a valid Array!");

      const records = input.records.map(
        (record): EncodedRecord => ({
          key: encodeKey(record?.key),
          value: encodeBytes(record?.value),
        }),
      );

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
    const isCallerMutableBytes = typeof value !== "string";
    if (isCallerMutableBytes) return encodeBytes(value);
    if (latestTextKey?.value === value) return latestTextKey.encoded;

    const encoded = encodeBytes(value);
    latestTextKey = { value, encoded };
    return encoded;
  }
}
