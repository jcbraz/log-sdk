import type { SequenceInput } from "./records.js";

export interface ListSegmentsRequest {
  /** Inclusive global sequence. Default: 0. */
  startSequence?: SequenceInput;
  /** Exclusive global sequence. Returns segments overlapping the requested range. */
  endSequence?: SequenceInput;
}

export interface ListSegmentsResponse {
  status: "success";
  segments: { id: number; startSeq: bigint; startTimeMs: bigint }[];
}
