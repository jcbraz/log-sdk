import type ts from "typescript";

export type DiagnosticLabel = { span: { offset: number; length: number } };
export type DiagnosticLocation = { code: string; labels: DiagnosticLabel[] };
export type OxlintDiagnostic = DiagnosticLocation & { message: string };
export type OxlintReport = { diagnostics: OxlintDiagnostic[] };
export type LintSourceResult = {
  diagnostics: OxlintDiagnostic[];
  exitCode: number;
  stderr: string;
};
export type TypeScriptFixture = { program: ts.Program; root: string };
export type AuditLocation = {
  file: string;
  rule: string;
  line: number;
  column: number;
};
