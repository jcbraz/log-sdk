import { decodeBytes } from "./bytes.js";
import { ProtocolError, ValidationError } from "./errors.js";
import type {
  AppendResponse,
  CountResponse,
  ScanResponse,
  SequenceInput,
} from "./types/records.js";
import type { ListKeysResponse } from "./types/keys.js";
import type { ListSegmentsResponse } from "./types/segments.js";

export function decodeAppend(body: unknown): AppendResponse {
  const response = successResponse(body);
  return {
    status: "success",
    recordsAppended: responseNumber({
      response,
      field: "recordsAppended",
      maximum: 2 ** 31 - 1,
    }),
    startSequence: responseBigInt({ response, field: "startSequence" }),
  };
}

export function decodeScan(body: unknown): ScanResponse {
  const response = successResponse(body);
  const values = responseArray(response, "values").map((value) => {
    const entry = responseObject(value, "values entry");
    return {
      sequence: responseBigInt({ response: entry, field: "sequence" }),
      value: decodeBytes(entry.value, "value"),
    };
  });
  const page: ScanResponse = {
    status: "success",
    key: decodeBytes(response.key, "key"),
    values,
  };
  const hasCursor = response.nextSequence !== undefined;
  if (hasCursor) {
    page.nextSequence = responseBigInt({
      response,
      field: "nextSequence",
    });
  }
  return page;
}

export function decodeKeys(body: unknown): ListKeysResponse {
  const response = successResponse(body);
  const keys = responseArray(response, "keys").map((value) => {
    const entry = responseObject(value, "keys entry");
    return { key: decodeBytes(entry.key, "key") };
  });
  return { status: "success", keys };
}

export function decodeSegments(body: unknown): ListSegmentsResponse {
  const response = successResponse(body);
  const segments = responseArray(response, "segments").map((value) => {
    const segment = responseObject(value, "segment");
    return {
      id: responseNumber({
        response: segment,
        field: "id",
        maximum: 2 ** 32 - 1,
      }),
      startSeq: responseBigInt({ response: segment, field: "startSeq" }),
      startTimeMs: responseBigInt({
        response: segment,
        field: "startTimeMs",
        range: "i64",
      }),
    };
  });
  return { status: "success", segments };
}

export function decodeCount(body: unknown): CountResponse {
  const response = successResponse(body);
  return {
    status: "success",
    count: responseBigInt({ response, field: "count" }),
  };
}

/** Keep numeric syntax intact until the response schema checks it. */
export function parseJSON(text: string): unknown {
  return JSON.parse(
    text,
    (_key: string, value: unknown, context?: { source: string }) => {
      const isNumber = typeof value === "number";
      if (!isNumber) return value;

      const token = context?.source;
      const hasNumberSource = typeof token === "string";
      if (!hasNumberSource) {
        throw new ProtocolError("Runtime must support JSON number source text");
      }
      // Fractions can round to integers too; schema checks must see their syntax.
      const isExactInteger =
        Number.isSafeInteger(value) && /^-?\d+$/.test(token);
      return isExactInteger ? value : token;
    },
  );
}

export function sequence(value: SequenceInput, field: string): bigint {
  const isSafeNumber = typeof value === "number" && Number.isSafeInteger(value);
  const isInteger = typeof value === "bigint" || isSafeNumber;
  if (!isInteger) {
    throw new ValidationError(
      `${field} must be a safe integer number or bigint`,
    );
  }
  const integerValue = BigInt(value);
  const isUnsigned64 = integerValue >= 0n && integerValue <= maxSequence;
  if (!isUnsigned64) {
    throw new ValidationError(`${field} must be between 0 and ${maxSequence}`);
  }
  return integerValue;
}

export function integer({
  value,
  field,
  maximum = Number.MAX_SAFE_INTEGER,
}: {
  value: number;
  field: string;
  maximum?: number;
}): number {
  const isInRange =
    Number.isSafeInteger(value) && value >= 0 && value <= maximum;
  if (!isInRange) {
    throw new ValidationError(
      `${field} must be an integer between 0 and ${maximum}`,
    );
  }
  return value;
}

function successResponse(body: unknown): Record<string, unknown> {
  const response = responseObject(body, "response");
  const isSuccess = response.status === "success";
  if (!isSuccess) {
    throw new ProtocolError("Response status must be 'success'");
  }
  return response;
}

function responseObject(
  value: unknown,
  field: string,
): Record<string, unknown> {
  const isObject =
    value !== null && typeof value === "object" && !Array.isArray(value);
  if (!isObject) throw new ProtocolError(`${field} must be an object`);
  return value as Record<string, unknown>;
}

function responseArray(
  response: Record<string, unknown>,
  field: string,
): unknown[] {
  const value = response[field];
  const isArray = Array.isArray(value);
  if (!isArray) {
    throw new ProtocolError(`${field} must be an array`);
  }
  return value;
}

function responseNumber({
  response,
  field,
  maximum,
}: {
  response: Record<string, unknown>;
  field: string;
  maximum: number;
}): number {
  const value = response[field];
  const isInRange =
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= maximum;
  if (!isInRange) {
    throw new ProtocolError(
      `${field} must be an integer between 0 and ${maximum}`,
    );
  }
  return value;
}

function responseBigInt({
  response,
  field,
  range = "u64",
}: {
  response: Record<string, unknown>;
  field: string;
  range?: keyof typeof integerRanges;
}): bigint {
  const value = response[field];
  const isSafeNumber = typeof value === "number" && Number.isSafeInteger(value);
  const isIntegerString = typeof value === "string" && /^-?\d+$/.test(value);
  const isExactInteger = isSafeNumber || isIntegerString;
  if (!isExactInteger) {
    throw new ProtocolError(`${field} must be an exact integer`);
  }

  const integer = BigInt(value);
  const { minimum, maximum, description } = integerRanges[range];
  const isInRange = integer >= minimum && integer <= maximum;
  if (!isInRange) {
    throw new ProtocolError(`${field} is outside the ${description} range`);
  }
  return integer;
}

const maxSequence = (1n << 64n) - 1n;
const integerRanges = {
  u64: {
    minimum: 0n,
    maximum: maxSequence,
    description: "unsigned 64-bit",
  },
  i64: {
    minimum: -(1n << 63n),
    maximum: (1n << 63n) - 1n,
    description: "signed 64-bit",
  },
};
