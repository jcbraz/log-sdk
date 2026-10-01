import { ValidationError } from "../../errors.js";
import { integer } from "../../protocol.js";
import type { ClientOptions } from "../../types/client.js";
import type { RequestInput } from "../request.js";

export function configureRequest(options: ClientOptions) {
  let baseURL: URL;
  try {
    baseURL = new URL(options.baseURL);
  } catch (cause) {
    throw new ValidationError("baseURL must be an absolute HTTP(S) URL", {
      cause,
    });
  }
  const isHTTP = baseURL.protocol === "http:" || baseURL.protocol === "https:";
  if (!isHTTP) throw new ValidationError("baseURL must use HTTP or HTTPS");

  const hasQueryFragmentOrCredentials =
    baseURL.search !== "" ||
    baseURL.hash !== "" ||
    baseURL.username !== "" ||
    baseURL.password !== "";
  if (hasQueryFragmentOrCredentials)
    throw new ValidationError(
      "baseURL must not contain a query, fragment, or credentials; use headers for authentication",
    );

  baseURL.pathname = `${baseURL.pathname.replace(/\/+$/, "")}/`;
  const headers = new Headers(options.headers);
  const fetch = options.fetch ?? globalThis.fetch;
  const hasFetch = typeof fetch === "function";
  if (!hasFetch)
    throw new ValidationError("A fetch implementation is required");

  const timeoutMs = requestTimeout(options.timeoutMs ?? 35_000);
  return { baseURL, headers, fetch, timeoutMs };
}

export function prepareRequest({
  config,
  input,
}: {
  config: ReturnType<typeof configureRequest>;
  input: RequestInput<unknown>;
}) {
  const method = input.method ?? "GET";
  const url = new URL(input.path, config.baseURL);
  const query = Object.entries(input.query ?? {})
    .filter(([, value]) => value !== undefined)
    .map(([name, value]): [string, string] => [name, String(value)]);
  url.search = new URLSearchParams(query).toString();

  const expectsText = input.responseFormat === "text";
  const body = input.body;
  const hasBody = body !== undefined;
  const headers = new Headers(config.headers);
  headers.set("Accept", expectsText ? "text/plain" : "application/json");
  if (hasBody) headers.set("Content-Type", "application/json");

  const init: RequestInit = { method, headers };
  if (hasBody) init.body = body;
  const timeoutMs = requestTimeout(
    input.options?.timeoutMs ?? config.timeoutMs,
  );
  return { url, init, method, expectsText, timeoutMs };
}

function requestTimeout(value: number): number {
  const timeoutMs = integer({
    value,
    field: "timeoutMs",
    maximum: 2_147_483_647,
  });
  const isPositive = timeoutMs > 0;
  if (!isPositive)
    throw new ValidationError("timeoutMs must be greater than zero");
  return timeoutMs;
}
