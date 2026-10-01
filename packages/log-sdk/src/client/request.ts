import type { ClientOptions, RequestOptions } from "../types/client.js";
import { configureRequest, prepareRequest } from "./request/config.js";
import { withRequestDeadline } from "./request/lifecycle.js";
import { readResponse } from "./request/response.js";

export interface RequestInput<T> {
  path: string;
  method?: "POST";
  body?: string;
  query?: Record<string, string | number | bigint | boolean | undefined>;
  options: RequestOptions | undefined;
  responseFormat?: "json" | "text";
  onDispatch?: () => void;
  decode: (body: unknown) => T;
}

export type Request = <T>(input: RequestInput<T>) => Promise<T>;

export function createRequest(options: ClientOptions): Request {
  const config = configureRequest(options);

  return async function request<T>(input: RequestInput<T>): Promise<T> {
    const { url, init, method, expectsText, timeoutMs } = prepareRequest({
      config,
      input,
    });

    return withRequestDeadline(
      { timeoutMs, signal: input.options?.signal },
      async (signal) => {
        init.signal = signal;
        // Mark dispatch immediately before fetch: later append failures have unknown outcomes.
        input.onDispatch?.();
        const response = await config.fetch(url, init);
        const body = await readResponse({ response, url, method, expectsText });
        return input.decode(body);
      },
    );
  };
}
