/** RFC 4648 symbols, ordered by their six-bit value. */
export const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Never appended by the SDK; a scan of it reports only the log's observed end. */
export const END_SEQUENCE_PROBE_KEY =
  "\u0000opendata-log-sdk/end-sequence-probe";
