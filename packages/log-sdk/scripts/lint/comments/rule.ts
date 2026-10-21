import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { VisitorObject } from "oxlint/plugins-dev";
import type { OxlintComment, OxlintContext, OxlintRule } from "../types.ts";
import type { PackageManifest } from "./types.ts";

const BIOME_DIRECTIVE =
  /^biome-ignore lint\/[a-zA-Z]+\/[a-zA-Z]+: External limitation documented above\.$/;
const SPDX_HEADER =
  /^SPDX-License-Identifier: [A-Za-z0-9.-]+(?:\nCopyright \(c\) \d{4}(?:-\d{4})? [^\n]+)?$/;
const TOOL_DIRECTIVE = /^\s*(?:@ts-|biome-|eslint-|oxlint-|[#@]__PURE__)/;

const externalDependenciesByDirectory = new Map<string, Set<string>>();

type Explanation = {
  comments: OxlintComment[];
  lines: string[];
  start: number;
  end: number;
};

export const externalDependencyComments = {
  meta: {
    type: "suggestion",
    schema: [],
    messages: {
      explainInCode:
        "Express this explanation in the code. Keep a comment only for adjacent JSDoc API documentation or an external dependency limitation with External dependency, Limitation, Consequence, and Docs fields linking to official documentation.",
    },
  },
  createOnce(context): VisitorObject {
    return {
      Program(): void {
        const sourceCode = context.sourceCode;
        const externalDependencies = findExternalDependencies(context.filename);
        const explanations = groupIntoExplanations(sourceCode);

        explanations.forEach((explanation, index): void => {
          const previous = explanations[index - 1];
          if (
            isAllowed({
              context,
              explanation,
              previous,
              externalDependencies,
            })
          )
            return;

          const [first] = explanation.comments;
          const last = explanation.comments.at(-1);
          if (!first || !last) return;
          context.report({
            loc: { start: first.loc.start, end: last.loc.end },
            messageId: "explainInCode",
          });
        });
      },
    };
  },
} satisfies OxlintRule;

function isAllowed({
  context,
  explanation,
  previous,
  externalDependencies,
}: {
  context: OxlintContext;
  explanation: Explanation;
  previous: Explanation | undefined;
  externalDependencies: ReadonlySet<string>;
}): boolean {
  const { lines } = explanation;
  const text = context.sourceCode.text;

  const isCompilerDirective =
    lines.length === 1 && lines[0] === "@ts-expect-error";
  const isPureAnnotation =
    lines.length === 1 && /^[@#]__PURE__$/.test(lines[0] ?? "");
  const isLicenseHeader =
    text.slice(0, explanation.start).trim() === "" &&
    SPDX_HEADER.test(lines.join("\n"));
  const isRequiredToolOrLicenseAnnotation =
    isCompilerDirective || isPureAnnotation || isLicenseHeader;
  if (isRequiredToolOrLicenseAnnotation) return true;

  const isApiDocumentation =
    explanation.comments.length === 1 &&
    explanation.comments[0]?.type === "Block" &&
    explanation.comments[0].value.startsWith("*") &&
    isAdjacentToCode(context, explanation);
  if (isApiDocumentation) return true;

  const isBiomeDirective =
    lines.length === 1 && BIOME_DIRECTIVE.test(lines[0] ?? "");
  if (isBiomeDirective) {
    const follows =
      previous !== undefined &&
      text.slice(previous.end, explanation.start).trim() === "";
    return (
      follows && isExternalLimitation(previous.lines, externalDependencies)
    );
  }

  return (
    isExternalLimitation(lines, externalDependencies) &&
    isAdjacentToCode(context, explanation)
  );
}

function isAdjacentToCode(
  context: OxlintContext,
  explanation: Explanation,
): boolean {
  const { sourceCode } = context;
  const [first] = explanation.comments;
  const last = explanation.comments.at(-1);
  if (!first || !last) return false;

  const previousToken = sourceCode.getTokenBefore(first);
  const followsCodeOnSameLine =
    previousToken !== null &&
    !sourceCode.text.slice(previousToken.end, first.start).includes("\n");

  const nextToken = sourceCode.getTokenAfter(last);
  const newlinesBeforeNextToken =
    nextToken === null
      ? Number.POSITIVE_INFINITY
      : (sourceCode.text.slice(last.end, nextToken.start).match(/\n/g)
          ?.length ?? 0);
  const precedesNearbyCode = newlinesBeforeNextToken <= 2;

  return followsCodeOnSameLine || precedesNearbyCode;
}

function isExternalLimitation(
  lines: readonly string[],
  externalDependencies: ReadonlySet<string>,
): boolean {
  if (lines.length !== 4) return false;
  const dependency = lines[0]?.match(/^External dependency: (\S+)$/)?.[1];
  if (!dependency || !externalDependencies.has(dependency)) return false;
  if (!/^Limitation: \S.+/.test(lines[1] ?? "")) return false;
  if (!/^Consequence: \S.+/.test(lines[2] ?? "")) return false;

  const reference = lines[3]?.match(/^Docs: (https:\/\/\S+)$/)?.[1];
  if (!reference || !URL.canParse(reference)) return false;
  const url = new URL(reference);
  const isSpecificPage = url.pathname !== "/";
  const hasCredentials = url.username !== "" || url.password !== "";
  return isSpecificPage && !hasCredentials;
}

function groupIntoExplanations(
  sourceCode: OxlintContext["sourceCode"],
): Explanation[] {
  const groups: OxlintComment[][] = [];
  for (const comment of sourceCode.getAllComments()) {
    const group = groups.at(-1);
    const previous = group?.at(-1);
    const joinsPrevious =
      previous !== undefined &&
      isPlainLineComment(previous) &&
      isPlainLineComment(comment) &&
      /^[\t ]*\r?\n[\t ]*$/.test(
        sourceCode.text.slice(previous.end, comment.start),
      );
    if (group && joinsPrevious) group.push(comment);
    else groups.push([comment]);
  }
  return groups.map(toExplanation);
}

function isPlainLineComment(comment: OxlintComment): boolean {
  return comment.type === "Line" && !TOOL_DIRECTIVE.test(comment.value);
}

function toExplanation(comments: OxlintComment[]): Explanation {
  return {
    comments,
    lines: comments.flatMap(toLines),
    start: comments[0]?.start ?? 0,
    end: comments.at(-1)?.end ?? 0,
  };
}

function toLines(comment: OxlintComment): string[] {
  const lines =
    comment.type === "Line"
      ? [comment.value]
      : comment.value
          .split(/\r?\n/)
          .map((line): string => line.replace(/^\s*\*?\s?/, ""));
  return lines.map((line): string => line.trim()).filter(Boolean);
}

function findExternalDependencies(filename: string): Set<string> {
  let directory = dirname(filename);
  while (!existsSync(resolve(directory, "package.json"))) {
    const parent = dirname(directory);
    if (parent === directory)
      throw new Error(`No package.json for ${filename}.`);
    directory = parent;
  }

  const cached = externalDependenciesByDirectory.get(directory);
  if (cached) return cached;

  const manifest: PackageManifest = JSON.parse(
    readFileSync(resolve(directory, "package.json"), "utf8"),
  );
  const declared = Object.entries({
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.peerDependencies,
    ...manifest.optionalDependencies,
  })
    .filter(([, version]): boolean => !version.startsWith("workspace:"))
    .map(([name]): string => name);
  const externalDependencies = new Set(["node", "bun", ...declared]);
  externalDependenciesByDirectory.set(directory, externalDependencies);
  return externalDependencies;
}
