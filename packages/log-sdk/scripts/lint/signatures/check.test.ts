import { expect, test } from "bun:test";
import { fixtureProgram } from "../testing/typescript.ts";
import { AuditRule } from "../types.ts";
import { checkSignatures } from "./check.ts";

test.each([
  { source: "function read(): string { return 'ok'; }", count: 0 },
  { source: "const read = (): string => 'ok';", count: 0 },
  { source: "function read() { return 'ok'; }", count: 1 },
  { source: "const read = () => 'ok';", count: 1 },
  { source: "const owner = { read() { return 'ok'; } };", count: 1 },
  {
    source: "class Owner { constructor() {} set value(next: number) {} }",
    count: 0,
  },
  {
    source:
      "declare function read(): string; type Output = ReturnType<typeof read>;",
    count: 1,
  },
  {
    source:
      "declare function read(id: string): string; type Input = Parameters<typeof read>;",
    count: 1,
  },
  {
    source:
      "type ReturnType<T> = T; declare function read(): string; type Output = ReturnType<typeof read>;",
    count: 0,
  },
  {
    source:
      "declare function read(): string; type Output = ReturnType<(typeof read)>;",
    count: 1,
  },
  {
    source:
      "declare function read(): string; declare function write(): void; type Output = ReturnType<typeof read | typeof write>;",
    count: 1,
  },
  {
    source:
      "declare const value: string; type Output = ReturnType<() => typeof value>;",
    count: 0,
  },
  {
    source:
      "class Owner { get value() { return 1; } async read() { return 1; } }",
    count: 2,
  },
])("signature policy: $source", ({ source, count }): void => {
  const { program, root } = fixtureProgram({ "sample.ts": source });
  const file = program.getSourceFile(`${root}/sample.ts`);
  if (!file) throw new Error("Fixture was not loaded");
  const findings = checkSignatures(file, program.getTypeChecker());
  expect(findings.map((finding): AuditRule => finding.rule)).toEqual(
    Array.from(
      { length: count },
      (): AuditRule => AuditRule.ExplicitSignatures,
    ),
  );
});
