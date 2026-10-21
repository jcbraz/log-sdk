import { EventEncodingError, ValidationError } from "../errors.js";
import { runAppend } from "../shared.js";
import type { RequestOptions } from "../types/client.js";
import type { AppendRequest, AppendResponse } from "../types/records.js";
import type { Codec, StreamAppendRequest } from "../types/stream.js";
import type { EncodedEvent, StreamAppend, StreamClient } from "./types.js";

export function createAppend<T>({
  client,
  key,
  codec,
}: {
  client: StreamClient;
  key: string;
  codec: Codec<T>;
}): StreamAppend<T> {
  return function append(
    input: StreamAppendRequest<T>,
    options?: RequestOptions,
  ): Promise<AppendResponse> {
    return runAppend((markDispatched): Promise<AppendResponse> => {
      const isValuesArray = Array.isArray(input.values);
      if (!isValuesArray) {
        throw new ValidationError("values must be an array");
      }
      const records = input.values.map((value, index): EncodedEvent => {
        try {
          return { key, value: codec.encode(value) };
        } catch (cause) {
          throw new EventEncodingError({ index, cause });
        }
      });
      const request: AppendRequest = { records };
      if (input.awaitDurable !== undefined) {
        request.awaitDurable = input.awaitDurable;
      }

      markDispatched();
      return client.append(request, options);
    });
  };
}
