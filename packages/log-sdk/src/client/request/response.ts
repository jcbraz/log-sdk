import { HttpError, ProtocolError } from "../../errors.js";
import { parseJSON } from "../../protocol.js";

export async function readResponse({
  response,
  url,
  method,
  expectsText,
}: {
  response: Response;
  url: URL;
  method: string;
  expectsText: boolean;
}): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) throw parseHttpError({ response, text, url, method });
  if (expectsText) return text;

  try {
    return parseJSON(text);
  } catch (cause) {
    throw new ProtocolError("Failed to parse Log response as JSON", { cause });
  }
}

function parseHttpError({
  response,
  text,
  url,
  method,
}: {
  response: Response;
  text: string;
  url: URL;
  method: string;
}): HttpError {
  const body = parseErrorBody(text);
  const hasMessageField =
    body !== null && typeof body === "object" && "message" in body;
  const bodyMessage = hasMessageField ? body.message : undefined;
  const hasTextMessage = typeof bodyMessage === "string";
  const message = hasTextMessage
    ? bodyMessage
    : text || `${method} ${url.pathname} failed with HTTP ${response.status}`;
  return new HttpError({
    message,
    status: response.status,
    headers: response.headers,
    body,
    method,
    url: url.toString(),
  });
}

function parseErrorBody(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Framework and proxy failures can be plain text.
    return text;
  }
}
