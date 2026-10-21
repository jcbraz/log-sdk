import { expect, test } from "bun:test";
import { lintSource } from "../testing/oxlint.ts";
import type { DiagnosticLocation } from "../testing/types.ts";

test.each([
  {
    name: "DMS error mapping",
    source:
      'function reason(error: InternalError) { const unverified = error.code === ErrorCode.CONFLICT || error.code === ErrorCode.INVALID_DATA; return unverified ? "version-unverified" : "storage-unavailable"; } reason(error);',
  },
  {
    name: "function declaration",
    source: "function helper(value) { return value + 1; } helper(2);",
  },
  {
    name: "const arrow",
    source: "const helper = value => value + 1; helper(2);",
  },
  {
    name: "const function expression",
    source: "const helper = function(value) { return value + 1; }; helper(2);",
  },
  {
    name: "named function expression",
    source:
      "const helper = function calculate(value) { return value + 1; }; helper(2);",
  },
  {
    name: "two local values",
    source:
      "function helper(value) { const doubled = value * 2; const positive = doubled > 0; return positive ? doubled : 0; } helper(2);",
  },
  {
    name: "two values in one declaration",
    source:
      "function helper(value) { const doubled = value * 2, positive = doubled > 0; return positive ? doubled : 0; } helper(2);",
  },
  {
    name: "default value",
    source: "function helper(value = 1) { return value + 1; } helper();",
  },
  {
    name: "default property read",
    source:
      "function helper(value = options.value) { return value + 1; } helper();",
  },
  {
    name: "destructured default",
    source:
      "function helper({ value = 1 }) { return value + 1; } helper(options);",
  },
  {
    name: "array destructuring",
    source:
      "function helper([value = 1]) { return value + 1; } helper(values);",
  },
  {
    name: "computed property read",
    source: "const helper = value => value[key]; helper(options);",
  },
  {
    name: "optional property read",
    source: "const helper = value => value?.code ?? 0; helper(options);",
  },
  {
    name: "template value",
    source: `const helper = value => \`name:\${value}\`; helper(name);`,
  },
  {
    name: "typeof comparison",
    source: 'const helper = value => typeof value === "string"; helper(input);',
  },
  {
    name: "call before declaration",
    source: "helper(2); function helper(value) { return value + 1; }",
  },
  {
    name: "shadowed reference belongs to another binding",
    source:
      "function helper(value) { return value + 1; } helper(2); function other(helper) { return helper(3); }",
  },
  {
    name: "private helper inside a function",
    source:
      "export function run(value) { const helper = input => input + 1; return helper(value); }",
  },
])("rejects $name", ({ source }): void => {
  const report = lintSource(source, "sdk/prefer-local-value");
  expect(report.exitCode, report.stderr).toBe(1);
  const identifier = source.includes("function reason") ? "reason" : "helper";
  const declarationOffset = source.includes(`function ${identifier}`)
    ? source.indexOf(`function ${identifier}`) + "function ".length
    : source.indexOf(`const ${identifier}`) + "const ".length;
  expect(
    report.diagnostics.map(
      ({ code, labels }): DiagnosticLocation => ({ code, labels }),
    ),
  ).toEqual([
    {
      code: "sdk(prefer-local-value)",
      labels: [
        { span: { offset: declarationOffset, length: identifier.length } },
      ],
    },
  ]);
});

test.each([
  {
    name: "two call sites",
    source:
      "function helper(value) { return value + 1; } helper(2); helper(3);",
  },
  {
    name: "an unused helper",
    source: "function helper(value) { return value + 1; }",
  },
  {
    name: "a callback",
    source: "function helper(value) { return value + 1; } values.map(helper);",
  },
  {
    name: "a returned helper",
    source:
      "function helper(value) { return value + 1; } export function make() { return helper; }",
  },
  {
    name: "an exported declaration",
    source: "export function helper(value) { return value + 1; } helper(2);",
  },
  {
    name: "an exported const",
    source: "export const helper = value => value + 1; helper(2);",
  },
  {
    name: "a later named export",
    source:
      "function helper(value) { return value + 1; } helper(2); export { helper };",
  },
  {
    name: "a default exported function",
    source:
      "export default function helper(value) { return value + 1; } helper(2);",
  },
  {
    name: "a later default export",
    source:
      "const helper = value => value + 1; helper(2); export default helper;",
  },
  {
    name: "a mutable binding",
    source: "let helper = value => value + 1; helper(2);",
  },
  {
    name: "a reassigned declaration",
    source:
      "function helper(value) { return value + 1; } helper = other; helper(2);",
  },
  {
    name: "async work",
    source: "async function helper(value) { return value + 1; } helper(2);",
  },
  {
    name: "a generator",
    source: "function* helper(value) { return value + 1; } helper(2);",
  },
  {
    name: "a type predicate",
    source:
      'function helper(value): value is string { return typeof value === "string"; } helper(input);',
  },
  {
    name: "an assertion signature",
    source:
      "function helper(value): asserts value { return value; } helper(input);",
  },
  {
    name: "overloads",
    source:
      "function helper(value: number): number; function helper(value: string): string; function helper(value) { return value; } helper(2);",
  },
  {
    name: "recursion",
    source:
      "function helper(value) { return value ? helper(value - 1) : 0; } helper(2);",
  },
  {
    name: "a named function returning itself",
    source: "const helper = function self() { return self; }; helper();",
  },
  {
    name: "a call inside the helper",
    source: "function helper(value) { return transform(value); } helper(2);",
  },
  {
    name: "construction",
    source: "function helper(value) { return new Value(value); } helper(2);",
  },
  {
    name: "an assignment",
    source: "function helper(value) { return value.count = 1; } helper(input);",
  },
  {
    name: "an increment",
    source: "function helper(value) { return value.count++; } helper(input);",
  },
  {
    name: "deletion",
    source:
      "function helper(value) { return delete value.count; } helper(input);",
  },
  {
    name: "a default call",
    source: "function helper(value = load()) { return value + 1; } helper();",
  },
  {
    name: "a destructured default call",
    source:
      "function helper({ value = load() }) { return value + 1; } helper(input);",
  },
  {
    name: "a computed destructuring call",
    source:
      "function helper({ [key()]: value }) { return value + 1; } helper(input);",
  },
  {
    name: "an array default call",
    source:
      "function helper([value = load()]) { return value + 1; } helper(input);",
  },
  {
    name: "this",
    source: "function helper() { return this.value; } helper();",
  },
  {
    name: "an explicit this parameter",
    source:
      "function helper(this: Owner, value) { return value + 1; } helper(2);",
  },
  {
    name: "arguments",
    source: "function helper() { return arguments[0]; } helper(2);",
  },
  {
    name: "three local values",
    source:
      "function helper(value) { const a = value + 1, b = a + 1, c = b + 1; return c; } helper(2);",
  },
  {
    name: "a mutable local",
    source:
      "function helper(value) { let result = value + 1; return result; } helper(2);",
  },
  {
    name: "a loop",
    source:
      "function helper(value) { for (const item of value) work(item); return 1; } helper(input);",
  },
  {
    name: "error handling",
    source:
      "function helper(value) { try { return value + 1; } catch { return 0; } } helper(2);",
  },
  {
    name: "a nested function",
    source:
      "function helper(value) { const get = () => value; return get; } helper(2);",
  },
  {
    name: "a call through a property",
    source:
      "function helper(value) { return value + 1; } helper.call(null, 2);",
  },
  {
    name: "a constructor call",
    source: "function helper(value) { return value + 1; } new helper(2);",
  },
  {
    name: "a separate type reference",
    source:
      "function helper(value) { return value + 1; } type Callback = typeof helper; helper(2);",
  },
])("keeps $name", ({ source }): void => {
  const report = lintSource(source, "sdk/prefer-local-value");
  expect(report.exitCode, report.stderr).toBe(0);
  expect(report.diagnostics).toEqual([]);
});
