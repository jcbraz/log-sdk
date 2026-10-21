import { TEST_FILE_PATTERN } from "./constants.ts";

export function isTestFile(file: string): boolean {
  const normalized = `/${file.replaceAll("\\", "/")}`;
  return (
    TEST_FILE_PATTERN.test(normalized) ||
    normalized.includes("/testing/") ||
    normalized.includes("/test-support/")
  );
}
