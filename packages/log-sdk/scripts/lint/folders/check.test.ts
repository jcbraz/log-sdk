import { expect, test } from "bun:test";
import { AuditRule } from "../types.ts";
import { checkFolderFileCounts } from "./check.ts";

const sourceFiles = (folder: string, count: number): string[] =>
  Array.from(
    { length: count },
    (_, index): string => `${folder}/file-${String(index).padStart(2, "0")}.ts`,
  );

test("a folder may hold twenty implementation files", (): void => {
  expect(checkFolderFileCounts(sourceFiles("feature", 20))).toEqual([]);
});

test("the twenty-first implementation file is reported", (): void => {
  const [finding, ...otherFindings] = checkFolderFileCounts(
    sourceFiles("feature", 21),
  );
  expect(finding?.rule).toBe(AuditRule.FolderFileCount);
  expect(finding?.file).toBe("feature/file-20.ts");
  expect(otherFindings).toEqual([]);
});

test("tests, fixtures and integration files do not count", (): void => {
  const testFiles = [
    "feature/a.test.ts",
    "feature/b.test.tsx",
    "feature/c.fixture.ts",
    "feature/d.postgres.integration.ts",
    "feature/e.test-support.ts",
  ];
  expect(
    checkFolderFileCounts([...sourceFiles("feature", 20), ...testFiles]),
  ).toEqual([]);
});

test("tool specs count as implementation files", (): void => {
  const findings = checkFolderFileCounts([
    ...sourceFiles("tools", 20),
    "tools/search.spec.ts",
  ]);
  expect(findings).toHaveLength(1);
});

test("subfolders are counted separately", (): void => {
  const files = [
    ...sourceFiles("feature", 15),
    ...sourceFiles("feature/stream", 15),
  ];
  expect(checkFolderFileCounts(files)).toEqual([]);
});
