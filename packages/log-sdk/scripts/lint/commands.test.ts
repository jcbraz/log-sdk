import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const directories = new Set<string>();

afterEach((): void => {
  for (const directory of directories) rmSync(directory, { recursive: true });
  directories.clear();
});

test.each([
  { name: "clean input", source: "export const value = 2 + 1;", exitCode: 0 },
  {
    name: "a single-use value helper",
    source: "function helper(value) { return value + 1; } helper(2);",
    exitCode: 1,
    diagnostic: "sdk(prefer-local-value)",
  },
  {
    name: "a narrating comment",
    source: "// Explain the value\nexport const value = 1;",
    exitCode: 1,
    diagnostic: "sdk(external-dependency-comments)",
  },
])("the Oxlint command preserves the result for $name", (fixture): void => {
  const file = writeFixture(fixture.source);
  const result = Bun.spawnSync([
    process.execPath,
    "scripts/lint/check.ts",
    file,
  ]);
  const output = result.stdout.toString() + result.stderr.toString();
  expect(result.exitCode, output).toBe(fixture.exitCode);
  if (fixture.diagnostic) expect(output).toContain(fixture.diagnostic);
});

test.each([
  {
    name: "clean input",
    source: "export function read(): number { return 1; }",
    exitCode: 0,
    diagnostic: "0 contract findings",
  },
  {
    name: "a missing return type",
    source: "export function read() { return 1; }",
    exitCode: 1,
    diagnostic: "sdk/explicit-signatures",
  },
  {
    name: "three positional parameters",
    source: "export function read(a: 1, b: 2, c: 3): void {}",
    exitCode: 1,
    diagnostic: "sdk/max-positional-params",
  },
  {
    name: "invalid syntax",
    source: "const value = ;",
    exitCode: 1,
    diagnostic: "Expression expected",
  },
])("the TypeScript audit fails or passes for $name", (fixture): void => {
  const file = writeFixture(fixture.source);
  const result = Bun.spawnSync([
    process.execPath,
    "scripts/lint/typescript-audit.ts",
    file,
  ]);
  const output = result.stdout.toString() + result.stderr.toString();
  expect(result.exitCode, output).toBe(fixture.exitCode);
  expect(output).toContain(fixture.diagnostic);
});

function writeFixture(source: string): string {
  const directory = mkdtempSync(resolve(tmpdir(), "sdk-lint-command-"));
  directories.add(directory);
  writeFileSync(resolve(directory, "package.json"), "{}");
  const file = resolve(directory, "sample.ts");
  writeFileSync(file, source);
  return file;
}
