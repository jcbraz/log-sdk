import { ProtocolError } from "../errors.js";
import { runRead } from "../shared.js";
import type { RequestOptions } from "../types/client.js";
import type { Request } from "./request.js";
import type { TelemetryOperations } from "./types.js";

/** Operational endpoints return the server's text. */
export function createTelemetry(request: Request): TelemetryOperations {
  return {
    healthy(options?: RequestOptions): Promise<string> {
      return runRead(
        "healthy",
        (): Promise<string> =>
          request({
            path: "-/healthy",
            responseFormat: "text",
            options,
            decode: decodeText,
          }),
      );
    },

    ready(options?: RequestOptions): Promise<string> {
      return runRead(
        "ready",
        (): Promise<string> =>
          request({
            path: "-/ready",
            responseFormat: "text",
            options,
            decode: decodeText,
          }),
      );
    },

    metrics(options?: RequestOptions): Promise<string> {
      return runRead(
        "metrics",
        (): Promise<string> =>
          request({
            path: "metrics",
            responseFormat: "text",
            options,
            decode: decodeText,
          }),
      );
    },
  };
}

function decodeText(body: unknown): string {
  const isText = typeof body === "string";
  if (!isText) throw new ProtocolError("Operational response must be text");
  return body;
}
