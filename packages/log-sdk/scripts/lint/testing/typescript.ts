import { resolve } from "node:path";
import ts from "typescript";
import type { TypeScriptFixture } from "./types.ts";

export function fixtureProgram(
  files: Record<string, string>,
): TypeScriptFixture {
  const root = resolve("scripts/lint/testing/fixtures");
  const sources = new Map(
    Object.entries(files).map(([file, source]): [string, string] => [
      resolve(root, file),
      source,
    ]),
  );
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    moduleDetection: ts.ModuleDetectionKind.Force,
    jsx: ts.JsxEmit.Preserve,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    types: [],
  };
  const host = ts.createCompilerHost(options, true);
  const readFile = host.readFile;
  const fileExists = host.fileExists;
  const directoryExists = host.directoryExists;
  host.readFile = (path): string | undefined =>
    sources.get(path) ?? readFile(path);
  host.fileExists = (path): boolean => sources.has(path) || fileExists(path);
  host.directoryExists = (path): boolean =>
    [...sources.keys()].some((file): boolean => file.startsWith(`${path}/`)) ||
    (directoryExists?.(path) ?? false);
  const program = ts.createProgram([...sources.keys()], options, host);
  return { program, root };
}
