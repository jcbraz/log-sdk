import { expect, test } from "bun:test";

test("Oxlint syntax rules preserve their accepted and rejected cases", (): void => {
  const result = Bun.spawnSync([
    "node",
    "--test",
    "scripts/lint/control-flow/rule.fixture.ts",
    "scripts/lint/handlers/rule.fixture.ts",
  ]);
  expect(
    result.exitCode,
    result.stdout.toString() + result.stderr.toString(),
  ).toBe(0);
});
