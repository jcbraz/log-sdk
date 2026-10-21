import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type {
  DiagnosticLabel,
  LintSourceResult,
  OxlintDiagnostic,
  OxlintReport,
} from "./types.ts";

export function lintSource(source: string, rule: string): LintSourceResult {
  const directory = mkdtempSync(resolve(tmpdir(), "sdk-oxlint-fixture-"));
  const path = resolve(directory, "sample.ts");
  const config = resolve(directory, "oxlintrc.json");
  try {
    writeFileSync(path, source);
    writeFileSync(
      config,
      JSON.stringify({
        plugins: [],
        categories: { correctness: "off" },
        jsPlugins: [
          {
            name: "sdk",
            specifier: resolve("scripts/lint/oxlint-plugin.ts"),
          },
        ],
        rules: { [rule]: "error" },
      }),
    );
    const result = Bun.spawnSync([
      "node",
      "node_modules/oxlint/bin/oxlint",
      "--config",
      config,
      "--format",
      "json",
      path,
    ]);
    const report: OxlintReport = JSON.parse(result.stdout.toString());
    return {
      diagnostics: report.diagnostics.map(
        ({ code, message, labels }): OxlintDiagnostic => ({
          code,
          message,
          labels: labels.map(toSpanLabel),
        }),
      ),
      exitCode: result.exitCode,
      stderr: result.stderr.toString(),
    };
  } finally {
    rmSync(directory, { recursive: true });
  }
}

export function toSpanLabel({ span }: DiagnosticLabel): DiagnosticLabel {
  return { span: { offset: span.offset, length: span.length } };
}
