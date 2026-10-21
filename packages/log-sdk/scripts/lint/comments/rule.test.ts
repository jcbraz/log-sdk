import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { toSpanLabel } from "../testing/oxlint.ts";
import type { DiagnosticLocation, OxlintReport } from "../testing/types.ts";
import type { CommentFixture } from "./types.ts";

const RULE_CODE = "sdk(external-dependency-comments)";
const directories = new Set<string>();

const limitation = [
  "External dependency: @mastra/core",
  "Limitation: The API does not accept an abort signal.",
  "Consequence: The caller supplies a bounded timeout.",
  "Docs: https://mastra.ai/reference/tools/create-tool",
];
const toBlockComment = (lines: string[]): string =>
  `/*\n${lines.join("\n")}\n*/`;
const withDocs = (docs: string): string[] => [
  ...limitation.slice(0, 3),
  `Docs: ${docs}`,
];
const biomeSuppression =
  "// biome-ignore lint/complexity/useDateNow: External limitation documented above.";

afterEach((): void => {
  for (const directory of directories) rmSync(directory, { recursive: true });
  directories.clear();
});

test.each([
  {
    name: "a plain block comment above a declaration",
    comment: "/* Read one page. */",
    code: "/* Read one page. */\nexport function read() {}",
  },
  {
    name: "a JSDoc block separated from the code it documents",
    comment: "/** Read one page. */",
    code: "/** Read one page. */\n\n\nexport function read() {}",
  },
  {
    name: "a narrating line comment",
    comment: "// Update the value",
    code: "// Update the value\nconst value = 1;",
  },
  {
    name: "adjacent line comments, as one finding",
    comment: "// first line\n// second line",
    code: "// first line\n// second line\nconst value = 1;",
  },
  {
    name: "a trailing comment",
    comment: "// explanation",
    code: "const value = 1; // explanation",
  },
  {
    name: "a JSX comment",
    comment: "/* Explain the view */",
    code: "const view = <div>{/* Explain the view */}</div>;",
  },
  {
    name: "a compiler suppression without a documented reason",
    comment: "// @ts-ignore",
    code: "// @ts-ignore\nconst value: string = 1;",
  },
  {
    name: "a license header that is not at the top of the file",
    comment: "/* SPDX-License-Identifier: MIT */",
    code: "const value = 1;\n/* SPDX-License-Identifier: MIT */",
  },
  {
    name: "a Biome suppression without a documented limitation",
    comment: biomeSuppression,
    code: `${biomeSuppression}\nconst value = 1;`,
  },
  limitationCase({
    name: "a limitation naming an undeclared dependency",
    lines: limitation.map((line): string =>
      line.replace("@mastra/core", "other-library"),
    ),
  }),
  limitationCase({
    name: "a limitation without a Docs field",
    lines: limitation.slice(0, 3),
  }),
  limitationCase({
    name: "a limitation linking over http",
    lines: withDocs("http://mastra.ai/reference/tools"),
  }),
  limitationCase({
    name: "a limitation linking to a homepage",
    lines: withDocs("https://mastra.ai/"),
  }),
  limitationCase({
    name: "a limitation detached from the code",
    lines: limitation,
    after: "\n\n\nrun();",
  }),
])("rejects $name", ({ comment, code }): void => {
  const diagnostics = lintSource(code);
  expect(diagnostics).toEqual([
    {
      code: RULE_CODE,
      labels: [
        { span: { offset: code.indexOf(comment), length: comment.length } },
      ],
    },
  ]);
});

test.each([
  {
    name: "comment-like text in strings, templates, regexes, and JSX text",
    code: [
      'const url = "https://example.com // not /* a comment */";',
      "const text = `/* template */ // text`;",
      "const pattern = /\\/\\*.*\\*\\//;",
      "const view = <div>// text /* text */</div>;",
    ].join("\n"),
  },
  {
    name: "JSDoc API documentation above a declaration",
    code: "/**\n * Read one page.\n * @param input - Page bounds.\n */\nexport function read(input) {}",
  },
  {
    name: "JSDoc API documentation on a class member",
    code: "export class Log {\n  /** Append records. */\n  append;\n}",
  },
  {
    name: "a bare compiler directive",
    code: "// @ts-expect-error\nconst value: string = 1;",
  },
  {
    name: "a pure annotation",
    code: "const value = /*#__PURE__*/ create();",
  },
  {
    name: "a license header at the top of the file",
    code: "// SPDX-License-Identifier: MIT\n// Copyright (c) 2026 Athena\nconst value = 1;",
  },
  {
    name: "a documented limitation as line comments",
    code: `${limitation.map((line): string => `// ${line}`).join("\n")}\nrun();`,
  },
  {
    name: "a documented limitation as a block comment",
    code: `${toBlockComment(limitation)}\nrun();`,
  },
  {
    name: "a Biome suppression after a documented limitation",
    code: `${toBlockComment(limitation)}\n${biomeSuppression}\nrun();`,
  },
])("accepts $name", ({ code }): void => {
  expect(lintSource(code)).toEqual([]);
});

function limitationCase({
  name,
  lines,
  after = "\nrun();",
}: {
  name: string;
  lines: string[];
  after?: string;
}): CommentFixture {
  const comment = toBlockComment(lines);
  return { name, comment, code: `${comment}${after}` };
}

function lintSource(source: string): DiagnosticLocation[] {
  const directory = mkdtempSync(resolve(tmpdir(), "sdk-comment-rule-"));
  directories.add(directory);
  writeFileSync(
    resolve(directory, "package.json"),
    JSON.stringify({ dependencies: { "@mastra/core": "1.0.0" } }),
  );
  const path = resolve(directory, "sample.tsx");
  writeFileSync(path, source);
  const result = Bun.spawnSync([
    "node",
    "node_modules/oxlint/bin/oxlint",
    "--config",
    resolve(".oxlintrc.json"),
    "--format",
    "json",
    path,
  ]);
  const report: OxlintReport = JSON.parse(result.stdout.toString());
  return report.diagnostics
    .filter((diagnostic): boolean => diagnostic.code === RULE_CODE)
    .map(
      ({ code, labels }): DiagnosticLocation => ({
        code,
        labels: labels.map(toSpanLabel),
      }),
    );
}
