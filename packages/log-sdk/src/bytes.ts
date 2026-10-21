import { BASE64_ALPHABET } from "./constants.js";
import { ProtocolError, ValidationError } from "./errors.js";
import type { BytesInput } from "./types/records.js";

const textEncoder = new TextEncoder();

export function encodeBytes(bytesInput: BytesInput): string {
  const hasBuffer = typeof Buffer !== "undefined";
  const isText = typeof bytesInput === "string";
  if (hasBuffer && isText) {
    return Buffer.from(bytesInput, "utf8").toString("base64");
  }

  const inputBytes = isText ? textEncoder.encode(bytesInput) : bytesInput;
  const isUint8Array = inputBytes instanceof Uint8Array;
  if (!isUint8Array)
    throw new ValidationError(
      "Record keys and values must be strings or Uint8Array",
    );

  if (hasBuffer)
    return Buffer.from(
      inputBytes.buffer,
      inputBytes.byteOffset,
      inputBytes.byteLength,
    ).toString("base64");

  const engineSafeSpreadArgumentCount = 8192;
  let binaryString = "";
  for (
    let chunkStart = 0;
    chunkStart < inputBytes.length;
    chunkStart += engineSafeSpreadArgumentCount
  ) {
    binaryString += String.fromCharCode(
      ...inputBytes.subarray(
        chunkStart,
        chunkStart + engineSafeSpreadArgumentCount,
      ),
    );
  }
  return btoa(binaryString);
}

export function decodeBytes(
  base64Value: unknown,
  fieldName: string,
): Uint8Array {
  const isPaddedStandardBase64 =
    typeof base64Value === "string" &&
    base64Value.length % 4 === 0 &&
    /^[A-Za-z0-9+/]*={0,2}$/.test(base64Value);
  if (!isPaddedStandardBase64) {
    throw new ProtocolError(`${fieldName} must be padded standard base64`);
  }

  const hasDoublePadding = base64Value.endsWith("==");
  const singlePaddingLength = base64Value.endsWith("=") ? 1 : 0;
  const paddingLength = hasDoublePadding ? 2 : singlePaddingLength;
  const lastBase64Digit = BASE64_ALPHABET.indexOf(
    base64Value[base64Value.length - paddingLength - 1] ?? "",
  );
  const unusedBitsPerPaddingCharacter = 2;
  const unusedBitCount = paddingLength * unusedBitsPerPaddingCharacter;
  const unusedBitsMask = (1 << unusedBitCount) - 1;

  const hasCanonicalPadding = (lastBase64Digit & unusedBitsMask) === 0;
  if (!hasCanonicalPadding)
    throw new ProtocolError(`${fieldName} must use canonical base64 padding`);

  const hasBuffer = typeof Buffer !== "undefined";
  if (hasBuffer) {
    const decodedBuffer = Buffer.from(base64Value, "base64");
    return new Uint8Array(
      decodedBuffer.buffer,
      decodedBuffer.byteOffset,
      decodedBuffer.byteLength,
    );
  }

  const decodedBinaryString = atob(base64Value);
  return Uint8Array.from(decodedBinaryString, (byteCharacter): number =>
    byteCharacter.charCodeAt(0),
  );
}
