import { expect, test } from "bun:test";
import { fixtureProgram } from "../testing/typescript.ts";
import { checkPositionalParams } from "./positional-params.ts";

test.each([
  { source: "function read(a: string, b: string) {}", count: 0 },
  { source: "function read(a: string, b: string, c: string) {}", count: 1 },
  { source: "const read = (a: 1, b: 2, c: 3, d: 4) => {};", count: 1 },
  { source: "class Owner { read(a: 1, b: 2, c: 3) {} }", count: 1 },
  { source: "class Owner { constructor(a: 1, b: 2, c: 3) {} }", count: 1 },
  { source: "const owner = { read(a: 1, b: 2, c: 3) {} };", count: 1 },
  { source: "function read(a: 1, b: 2, ...rest: 3[]) {}", count: 1 },
  { source: "function read({ a, b, c }: { a: 1; b: 2; c: 3 }) {}", count: 0 },
  {
    source: "function read(this: Window, a: 1, b: 2) {}",
    count: 0,
  },
  {
    source: "function read(this: Window, a: 1, b: 2, c: 3) {}",
    count: 1,
  },
  { source: "declare function read(a: 1, b: 2, c: 3): void;", count: 1 },
  {
    source: "const onItem = (a: 1, b: 2, c: 3) => {}; [1].reduce(onItem, 0);",
    count: 1,
  },
  {
    source:
      "function each(run: (a: 1, b: 2, c: 3) => void): void { run(1, 2, 3); } each((a, b, c) => {});",
    count: 1,
  },
])("positional params: $source", ({ source, count }): void => {
  expect(findingsFor(source)).toBe(count);
});

test.each([
  { source: "[1].reduce((total, item, index) => total + index, 0);" },
  { source: "new Promise<void>(function (resolve, reject, extra) {});" },
  {
    source: "new Proxy({}, { apply(target, thisArg, args) { return args; } });",
  },
  {
    source:
      "const handler: ProxyHandler<object> = { set(target, key, value) { return true; } };",
  },
  {
    source:
      "class Reader extends Array<number> { reduce(a: any, b: any, c: any): any { return a; } }",
  },
])("a library-shaped signature is exempt: $source", ({ source }): void => {
  expect(findingsFor(source)).toBe(0);
});

test.each([
  {
    source: "export class Stream { constructor(a: 1, b: 2, c: 3) {} }",
    count: 0,
  },
  {
    source: "export class Stream { read(a: 1, b: 2, c: 3) {} }",
    count: 0,
  },
  {
    source: "export class Stream { private read(a: 1, b: 2, c: 3) {} }",
    count: 1,
  },
  {
    source:
      "export class Stream { constructor(a: 1, b: 2, c: 3) {} } export class Hidden { constructor(a: 1, b: 2, c: 3) {} }",
    count: 1,
  },
  {
    source: "export function Stream(a: 1, b: 2, c: 3) {}",
    count: 1,
  },
])(
  "a class exported from the package entry keeps its released signature: $source",
  ({ source, count }): void => {
    const { program, root } = fixtureProgram({
      "index.ts": 'export { Stream } from "./stream.ts";',
      "stream.ts": source,
    });
    const file = program.getSourceFile(`${root}/stream.ts`);
    if (!file) throw new Error("Fixture was not loaded");
    const findings = checkPositionalParams({
      source: file,
      checker: program.getTypeChecker(),
      publicEntry: program.getSourceFile(`${root}/index.ts`),
    });
    expect(findings.length).toBe(count);
  },
);

function findingsFor(source: string): number {
  const { program, root } = fixtureProgram({ "sample.ts": source });
  const file = program.getSourceFile(`${root}/sample.ts`);
  if (!file) throw new Error("Fixture was not loaded");
  return checkPositionalParams({
    source: file,
    checker: program.getTypeChecker(),
    publicEntry: undefined,
  }).length;
}
