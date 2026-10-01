import { integer, sequence } from "../protocol.js";
import type { SequenceInput } from "../types/records.js";

export function querySequence(
  value: SequenceInput | undefined,
  field: string,
): bigint | undefined {
  if (value === undefined) return undefined;
  return sequence(value, field);
}

export function queryInteger(input: {
  value: number | undefined;
  field: string;
  maximum?: number;
}): number | undefined {
  if (input.value === undefined) return undefined;
  return integer({ ...input, value: input.value });
}
