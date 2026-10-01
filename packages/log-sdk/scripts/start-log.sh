#!/usr/bin/env bash
set -euo pipefail

revision=5f5c28826921c1fe014e033c4506680be149d386
source_dir="${LOG_SOURCE_DIR:-${TMPDIR:-/tmp}/log-sdk-opendata}"
data_dir="${LOG_DATA_DIR:-${TMPDIR:-/tmp}/log-sdk-data}"
port="${LOG_PORT:-18081}"

if [[ ! -d "$source_dir/.git" ]]; then
  git clone https://github.com/opendata-oss/opendata.git "$source_dir"
  git -C "$source_dir" checkout "$revision"
fi

actual_revision=$(git -C "$source_dir" rev-parse HEAD)
if [[ "$actual_revision" != "$revision" ]]; then
  printf 'Expected upstream revision %s, found %s in %s\n' "$revision" "$actual_revision" "$source_dir" >&2
  exit 1
fi

mkdir -p "$data_dir"
cargo build --release --locked --manifest-path "$source_dir/log/Cargo.toml" --features http-server
exec "$source_dir/target/release/opendata-log" --port "$port" --data-dir "$data_dir" "$@"
