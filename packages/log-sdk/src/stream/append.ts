import type { Log } from "../client/index.js";
import { EventEncodingError, ValidationError } from "../errors.js";
import { runAppend } from "../shared.js";
import type { AppendRequest, AppendResponse } from "../types/records.js";
import type { RequestOptions } from "../types/client.js";
import type { Codec, StreamAppendRequest } from "../types/stream.js";

export function createAppend<T>({
  client,
  key,
  codec,
}: {
  client: Pick<Log, "append">;
  key: string;
  codec: Codec<T>;
}) {
  return function append(
    input: StreamAppendRequest<T>,
    options?: RequestOptions,
  ): Promise<AppendResponse> {
    return runAppend((markDispatched) => {
      const isValuesArray = Array.isArray(input.values);
      if (!isValuesArray) {
        throw new ValidationError("values must be an array");
      }
      const records = input.values.map((value, index) => {
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

      // The delegated client can refine this to not-sent if its own preflight fails.
      markDispatched();
      return client.append(request, options);
    });
  };
}
