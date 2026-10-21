import { resolve } from "node:path";
import { describe, it } from "node:test";
import { RuleTester } from "oxlint/plugins-dev";
import { maxIfConditions } from "./conditions.ts";
import { maxFunctionLines } from "./function-lines.ts";
import { noNestedTernary } from "./ternary.ts";

RuleTester.describe = describe;
RuleTester.it = it;
const tester = new RuleTester();

tester.run("max-if-conditions", maxIfConditions, {
  valid: [
    "if (ready && authorized) run();",
    "while (hasNext) step();",
    "const allowed = a && b && c; if (allowed) run();",
    "if (value ?? fallback) run();",
    "if (choices.some(value => value.a && value.b && value.c)) run();",
  ],
  invalid: [
    {
      code: "if (a && b && c) run();",
      errors: [{ messageId: "nameDecision", line: 1, column: 4 }],
    },
    {
      code: "while (a || !(b && c)) step();",
      errors: [{ messageId: "nameDecision" }],
    },
    {
      code: "do { step(); } while (a && (b || c));",
      errors: [{ messageId: "nameDecision" }],
    },
    {
      code: "if ((a && b && c) as boolean) run();",
      filename: "sample.ts",
      errors: [{ messageId: "nameDecision" }],
    },
    {
      code: "if ((a || b || c) satisfies boolean) run();",
      filename: "sample.ts",
      errors: [{ messageId: "nameDecision" }],
    },
  ],
});

const fiftyLineBody = `{\n${"  work();\n".repeat(48)}}`;
const fiftyOneLineBody = `{\n${"  work();\n".repeat(49)}}`;
const classBody = (methods: number): string =>
  `class Worker {\n${Array.from({ length: methods }, (_, index): string => `  step${index}() {}\n`).join("")}}`;
const fiftyLineClass = classBody(48);
const fiftyOneLineClass = classBody(49);
const documentedClass = `class Client {\n${Array.from({ length: 30 }, (_, index): string => `  /**\n   * Step ${index}.\n   */\n  step${index};\n`).join("")}}`;
const classWithTrailingComments = `class Worker {\n${Array.from({ length: 49 }, (_, index): string => `  step${index}() {} // ${index}\n`).join("")}}`;
const sourceFile = (name: string): string =>
  resolve(import.meta.dirname, "../../..", `src/${name}`);
tester.run("max-function-lines", maxFunctionLines, {
  valid: [
    `function process() ${fiftyLineBody}`,
    "const value = () => 1;",
    { code: fiftyLineClass, filename: sourceFile("worker.ts") },
    { code: fiftyOneLineClass, filename: sourceFile("worker.test.ts") },
    { code: documentedClass, filename: sourceFile("client.ts") },
  ],
  invalid: [
    {
      code: `function process() ${fiftyOneLineBody}`,
      errors: [{ messageId: "splitResponsibilities", data: { lines: 51 } }],
    },
    {
      code: `const process = () => ${fiftyOneLineBody}`,
      errors: [{ messageId: "splitResponsibilities", data: { lines: 51 } }],
    },
    {
      code: `const owner = { process() ${fiftyOneLineBody} };`,
      errors: [{ messageId: "splitResponsibilities", data: { lines: 51 } }],
    },
    {
      code: fiftyOneLineClass,
      filename: sourceFile("worker.ts"),
      errors: [{ messageId: "splitClass", data: { lines: 51 } }],
    },
    {
      code: classWithTrailingComments,
      filename: sourceFile("worker.ts"),
      errors: [{ messageId: "splitClass", data: { lines: 51 } }],
    },
  ],
});

tester.run("no-nested-ternary", noNestedTernary, {
  valid: [
    "const result = ready ? a : b;",
    "const result = ready ? (() => failed ? a : b) : fallback;",
  ],
  invalid: [
    {
      code: "const label = ready ? (failed ? 'error' : 'ok') : 'pending';",
      errors: [{ messageId: "nameIntermediate" }],
    },
    {
      code: "const label = (ready ? a : b) ? c : d;",
      errors: [{ messageId: "nameIntermediate" }],
    },
    {
      code: "const label = ready ? a : format(failed ? b : c);",
      errors: [{ messageId: "nameIntermediate" }],
    },
  ],
});
