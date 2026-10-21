import { statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import ts from "typescript";
import {
  PUBLIC_ENTRY,
  SOURCE_DIRECTORIES,
  TYPE_TEST_FILE_PATTERN,
} from "./constants.ts";
import { checkContracts } from "./contracts/check.ts";
import { checkDeclarations } from "./declarations/check.ts";
import { checkFolderFileCounts } from "./folders/check.ts";
import { checkSignatures } from "./signatures/check.ts";
import { checkPositionalParams } from "./signatures/positional-params.ts";
import type { AuditFinding } from "./types.ts";

const root = resolve(import.meta.dirname, "../..");
const publicEntryPath = resolve(root, PUBLIC_ENTRY);
const args = process.argv.slice(2);
const json = args.includes("--json");
const paths = args.filter((arg): boolean => arg !== "--json");
const unknownFlag = paths.find((arg): boolean => arg.startsWith("--"));
if (unknownFlag) throw new Error(`Unknown audit flag: ${unknownFlag}`);
const generatedPath = /(?:^|\/)(?:node_modules|dist|build)\/|\.d\.[cm]?ts$/;
const isAudited = (file: string): boolean =>
  !generatedPath.test(file) && !TYPE_TEST_FILE_PATTERN.test(file);
const files = new Set<string>();
for (const path of paths.length > 0 ? paths : SOURCE_DIRECTORIES) {
  const absolute = resolve(root, path);
  if (statSync(absolute).isFile()) {
    const isSource = /\.[cm]?[jt]sx?$/.test(absolute);
    if (isSource && isAudited(absolute)) files.add(absolute);
  } else {
    for await (const file of new Bun.Glob(
      "**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}",
    ).scan({ cwd: absolute, dot: true })) {
      if (isAudited(file)) files.add(resolve(absolute, file));
    }
  }
}
if (files.size === 0) throw new Error("The audit selected no source files.");

const groups = new Map<string, string[]>();
for (const file of [...files].sort()) {
  const config =
    ts.findConfigFile(dirname(file), ts.sys.fileExists) ??
    resolve(root, "tsconfig.json");
  const group = groups.get(config) ?? [];
  group.push(file);
  groups.set(config, group);
}
const diagnosticHost: ts.FormatDiagnosticsHost = {
  getCanonicalFileName: (file): string => relative(root, file),
  getCurrentDirectory: (): string => root,
  getNewLine: (): string => "\n",
};
const findings: AuditFinding[] = [...checkFolderFileCounts([...files])];
for (const [config, selectedFiles] of groups) {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    config,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic(diagnostic): never {
        throw new Error(ts.formatDiagnostics([diagnostic], diagnosticHost));
      },
    },
  );
  if (!parsed)
    throw new Error(`Unable to load compiler configuration ${config}.`);
  if (parsed.errors.length > 0)
    throw new Error(ts.formatDiagnostics(parsed.errors, diagnosticHost));
  const options: ts.CompilerOptions = {
    ...parsed.options,
    allowJs: true,
    noEmit: true,
    incremental: false,
    allowImportingTsExtensions: true,
  };
  const program = ts.createProgram(
    [...new Set([...selectedFiles, publicEntryPath])],
    options,
  );
  const publicEntry = program.getSourceFile(publicEntryPath);
  const optionErrors = program.getOptionsDiagnostics();
  if (optionErrors.length > 0)
    throw new Error(ts.formatDiagnostics(optionErrors, diagnosticHost));
  const checker = program.getTypeChecker();
  for (const file of selectedFiles) {
    const source = program.getSourceFile(file);
    if (!source) throw new Error(`The parser did not load ${file}.`);
    const syntaxErrors = program.getSyntacticDiagnostics(source);
    if (syntaxErrors.length > 0)
      throw new Error(ts.formatDiagnostics(syntaxErrors, diagnosticHost));
    const unresolvedImports = program
      .getSemanticDiagnostics(source)
      .filter((diagnostic): boolean =>
        [2307, 2792, 7016].includes(diagnostic.code),
      );
    if (unresolvedImports.length > 0)
      throw new Error(ts.formatDiagnostics(unresolvedImports, diagnosticHost));
    findings.push(
      ...checkDeclarations(source, checker),
      ...checkContracts(source, checker),
      ...checkSignatures(source, checker),
      ...checkPositionalParams({ source, checker, publicEntry }),
    );
  }
}
findings.sort(
  (left, right): number =>
    left.file.localeCompare(right.file) ||
    left.start - right.start ||
    left.rule.localeCompare(right.rule),
);
for (const finding of findings) finding.file = relative(root, finding.file);
if (json) console.log(JSON.stringify({ files: files.size, findings }, null, 2));
else {
  for (const finding of findings)
    console.error(
      `${finding.file}:${finding.line}:${finding.column}: ${finding.rule}: ${finding.message}`,
    );
  console.log(
    `Checked ${files.size} files; ${findings.length} contract findings.`,
  );
}
process.exit(findings.length > 0 ? 1 : 0);
