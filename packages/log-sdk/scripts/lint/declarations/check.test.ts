import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { fixtureProgram } from "../testing/typescript.ts";
import { AuditRule } from "../types.ts";
import { checkDeclarations } from "./check.ts";

const fixtures = [
  {
    name: "literal metadata owns enum-indexed fixed properties",
    file: "metadata/constants.ts",
    source:
      "import { Format, metadata } from './types'; const alias = metadata[Format.Pdf].mimeType; export const formats = { [alias]: Format.Pdf };",
    rules: [],
  },
  {
    name: "metadata fixtures keep their enum definition visible",
    file: "metadata/types.ts",
    source:
      "export enum Format { Pdf = 'pdf' } export const metadata = { [Format.Pdf]: { mimeType: 'application/pdf' } } as const;",
    rules: [AuditRule.DedicatedModuleContents],
    at: "export const metadata = { [Format.Pdf]: { mimeType: 'application/pdf' } } as const;",
  },
  {
    name: "a getter cannot masquerade as a constant property",
    file: "metadata-getter/constants.ts",
    source:
      "import { source } from './source'; export const mimeType = source.mimeType;",
    rules: [AuditRule.DedicatedModuleContents],
    at: "export const mimeType = source.mimeType;",
  },
  {
    name: "getter fixture remains runtime behavior",
    file: "metadata-getter/source.ts",
    source:
      "export const source = { get mimeType() { return 'application/pdf'; } };",
    rules: [],
  },
  {
    name: "a factory property remains runtime initialization",
    file: "metadata-factory/constants.ts",
    source:
      "import { createMetadata } from './source'; export const mimeType = createMetadata().mimeType;",
    rules: [AuditRule.DedicatedModuleContents],
    at: "export const mimeType = createMetadata().mimeType;",
  },
  {
    name: "factory fixture remains runtime behavior",
    file: "metadata-factory/source.ts",
    source:
      "export function createMetadata() { return { mimeType: 'application/pdf' }; }",
    rules: [],
  },
  {
    name: "destructuring counts each constant binding",
    file: "limits/destructuring.ts",
    source: "const { a, b, c, d } = { a: 1, b: 2, c: 3, d: 4 };",
    rules: [AuditRule.ConstantPlacement],
    at: "d",
  },
  {
    name: "assertions alone are not a test definition",
    file: "tests/assertions.ts",
    source:
      "import * as runner from 'bun:test'; const a = 1, b = 2, c = 3, d = 4; runner.expect(a).toBe(1);",
    rules: [AuditRule.ConstantPlacement],
    at: "d = 4",
  },
  {
    name: "runtime re-exports cannot hide in type modules",
    file: "reexport/types.ts",
    source: "export { parse } from '../packages/types/src/parse';",
    rules: [AuditRule.DedicatedModuleContents],
    at: "export { parse } from '../packages/types/src/parse';",
  },
  {
    name: "type-only exports are allowed",
    file: "type-export/types.ts",
    source: "export type { A } from '../limits/three';",
    rules: [],
  },
  {
    name: "regular expressions are fixed data",
    file: "limits/regex.ts",
    source: "const a = /a/, b = /b/, c = /c/, d = /d/;",
    rules: [AuditRule.ConstantPlacement],
    at: "d = /d/",
  },
  {
    name: "a package named types does not exempt implementation files",
    file: "packages/types/src/feature.ts",
    source: "type A = {}; type B = {}; type C = {}; type D = {};",
    rules: [AuditRule.TypePlacement],
    at: "type D = {};",
  },
  {
    name: "behavior can live in the shared types package",
    file: "packages/types/src/parse.ts",
    source: "export function parse(value: string) { return value; }",
    rules: [],
  },
  {
    name: "three independent declarations of each kind",
    file: "limits/three.ts",
    source:
      "type A = {}; interface B {} enum C { Value = 'value' } const a = 1, b = 2, c = 3;",
    rules: [],
  },
  {
    name: "four types including a late export",
    file: "limits/types-four.ts",
    source:
      "type A = {}; interface B {} enum C { Value = 'value' } run(); export type D = {};",
    rules: [AuditRule.TypePlacement],
    at: "export type D = {};",
  },
  {
    name: "four constants across declarations",
    file: "limits/constants-four.ts",
    source:
      "const a = 1, b = 2; run(); const c = [1, 2]; export const d = { count: 1 };",
    rules: [AuditRule.ConstantPlacement],
    at: "d = { count: 1 }",
  },
  {
    name: "fixed expressions and aliases",
    file: "limits/expressions.ts",
    source:
      "const a = 1; const b = a + 2; const c = { a, b }; const d = [...[a, b]] as const;",
    rules: [AuditRule.ConstantPlacement],
    at: "d = [...[a, b]] as const",
  },
  {
    name: "runtime initialization and functions",
    file: "runtime/values.ts",
    source:
      "const a = load(), b = new Client(), c = () => 1, d = logger.child({}), e = process.env.URL;",
    rules: [],
  },
  {
    name: "nested declarations",
    file: "nested/implementation.ts",
    source:
      "function run() { type A = {}; type B = {}; type C = {}; type D = {}; const a = 1, b = 2, c = 3, d = 4; }",
    rules: [],
  },
  {
    name: "cycles do not recurse forever",
    file: "runtime/cycle.ts",
    source: "const a = b, b = a, c = a, d = b;",
    rules: [],
  },
  {
    name: "actual test calls exempt constants",
    file: "tests/behavior.ts",
    source:
      "import { test as check } from 'bun:test'; const a = 1, b = 2, c = 3, d = 4; check.each([a])('value', () => {});",
    rules: [],
  },
  {
    name: "namespace test calls exempt constants",
    file: "tests/namespace.ts",
    source:
      "import * as runner from 'bun:test'; const a = 1, b = 2, c = 3, d = 4; runner.test('value', () => {});",
    rules: [],
  },
  {
    name: "tests retain type counts",
    file: "tests/contracts.test.ts",
    source:
      "import { test } from 'bun:test'; type A = {}; type B = {}; type C = {}; type D = {}; test('value', () => {});",
    rules: [AuditRule.TypePlacement],
    at: "type D = {};",
  },
  {
    name: "an unused runner import is not a test",
    file: "tests/unused.ts",
    source:
      "import { test } from 'bun:test'; const a = 1, b = 2, c = 3, d = 4;",
    rules: [AuditRule.ConstantPlacement],
    at: "d = 4",
  },
  {
    name: "a spec suffix is not a test",
    file: "tests/tool.spec.ts",
    source: "const a = 1, b = 2, c = 3, d = 4;",
    rules: [AuditRule.ConstantPlacement],
    at: "d = 4",
  },
  {
    name: "a shadowed test import is not a test call",
    file: "tests/shadowed.ts",
    source:
      "import { test } from 'bun:test'; function run(test) { test(); } const a = 1, b = 2, c = 3, d = 4;",
    rules: [AuditRule.ConstantPlacement],
    at: "d = 4",
  },
  {
    name: "focused type modules allow unlimited types",
    file: "valid/types/nested/input.ts",
    source: "type A = {}; type B = {}; type C = {}; type D = {};",
    rules: [],
  },
  {
    name: "constant modules allow unlimited data",
    file: "valid/constants.ts",
    source: "const a = 1, b = 2, c = 3, d = 4;",
    rules: [],
  },
  {
    name: "focused constants modules allow unlimited data",
    file: "valid/constants/defaults.ts",
    source: "const a = 1, b = 2, c = 3, d = 4;",
    rules: [],
  },
  {
    name: "runtime functions cannot hide in type modules",
    file: "invalid/types.ts",
    source: "export function run() { return 1; }",
    rules: [AuditRule.DedicatedModuleContents],
    at: "export function run() { return 1; }",
  },
  {
    name: "fixed data belongs outside type modules",
    file: "invalid-data/types.ts",
    source: "export const timeout = 1000;",
    rules: [AuditRule.DedicatedModuleContents],
    at: "export const timeout = 1000;",
  },
  {
    name: "functions cannot hide in constants modules",
    file: "invalid/constants.ts",
    source: "const run = () => 1;",
    rules: [AuditRule.DedicatedModuleContents],
    at: "const run = () => 1;",
  },
  {
    name: "types cannot hide in constants modules",
    file: "invalid-types/constants.ts",
    source: "type Request = { value: string };",
    rules: [AuditRule.DedicatedModuleContents],
    at: "type Request = { value: string };",
  },
];

const { program, root } = fixtureProgram(
  Object.fromEntries(
    fixtures.map((fixture): [string, string] => [fixture.file, fixture.source]),
  ),
);
const checker = program.getTypeChecker();

test.each(fixtures)("declarations: $name", (fixture): void => {
  const source = program.getSourceFile(resolve(root, fixture.file));
  if (!source) throw new Error(`Missing fixture ${fixture.file}`);
  const findings = checkDeclarations(source, checker);
  expect(findings.map((finding): AuditRule => finding.rule)).toEqual(
    fixture.rules,
  );
  if (fixture.at) {
    expect(findings).toHaveLength(1);
    expect(findings[0]?.start).toBe(fixture.source.indexOf(fixture.at));
    expect(findings[0]?.end).toBe(
      fixture.source.indexOf(fixture.at) + fixture.at.length,
    );
    expect(findings[0]?.line).toBe(1);
    expect(findings[0]?.column).toBe(fixture.source.indexOf(fixture.at) + 1);
    expect(findings[0]?.message).toMatch(/Move|Keep/);
  }
});

test("declarations diagnostics include the exact message and source range", (): void => {
  const file = resolve(root, "limits/types-four.ts");
  const source = program.getSourceFile(file);
  if (!source) throw new Error(`Missing fixture ${file}`);
  const start = source.text.indexOf("export type D = {};");
  expect(checkDeclarations(source, checker)).toEqual([
    {
      rule: AuditRule.TypePlacement,
      file,
      line: 1,
      column: start + 1,
      start,
      end: start + 19,
      message:
        "This module declares 4 types. Move the group into sibling types.ts or focused modules under types/.",
    },
  ]);
});
