export interface ListKeysRequest {
  /** Inclusive segment ID. */
  startSegment?: number;
  /** Exclusive segment ID. */
  endSegment?: number;
  /** Truncation limit; the API has no key pagination cursor. */
  limit?: number;
}

export interface KeyEntry {
  key: Uint8Array;
}

export interface ListKeysResponse {
  status: "success";
  keys: KeyEntry[];
}
