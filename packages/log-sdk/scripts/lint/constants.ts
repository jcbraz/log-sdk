export const PUBLIC_ENTRY = "src/index.ts";

export const SOURCE_DIRECTORIES = [
  "src",
  "test",
  "examples",
  "scripts",
] as const;

export const TEST_FILE_PATTERN =
  /\.(?:test|fixture|integration|test-support|compile)\.[cm]?[jt]sx?$/;

export const TYPE_TEST_FILE_PATTERN = /\.compile\.[cm]?ts$/;
