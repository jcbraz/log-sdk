import type { VisitorObject } from "oxlint/plugins-dev";
import { isTestFile } from "../source-scope.ts";
import type { OxlintContext, OxlintNode, OxlintRule } from "../types.ts";

export const maxFunctionLines = {
  meta: {
    type: "suggestion",
    schema: [],
    messages: {
      splitResponsibilities:
        "This function body spans {{lines}} lines; the limit is 50. Split distinct responsibilities into named helpers while preserving evaluation order and failures.",
      splitClass:
        "This class body spans {{lines}} lines outside comments; the limit is 50. Move the work into top-level functions the class delegates to.",
    },
  },
  create(context): VisitorObject {
    return {
      "FunctionDeclaration, FunctionExpression, ArrowFunctionExpression"(
        node,
      ): void {
        const isFunction =
          node.type === "FunctionDeclaration" ||
          node.type === "FunctionExpression";
        if (!isFunction && node.type !== "ArrowFunctionExpression") return;
        if (!node.body) return;
        const lines = node.body.loc.end.line - node.body.loc.start.line + 1;
        if (lines <= 50) return;
        context.report({
          node: node.body,
          messageId: "splitResponsibilities",
          data: { lines },
        });
      },
      ClassBody(node): void {
        if (isTestFile(context.filename)) return;
        const physicalLines = node.loc.end.line - node.loc.start.line + 1;
        const lines = physicalLines - countCommentOnlyLines(context, node);
        if (lines <= 50) return;
        context.report({ node, messageId: "splitClass", data: { lines } });
      },
    };
  },
} satisfies OxlintRule;

function countCommentOnlyLines(
  context: OxlintContext,
  body: OxlintNode,
): number {
  const { text } = context.sourceCode;
  const commentOnlyLines = new Set<number>();
  for (const comment of context.sourceCode.getAllComments()) {
    const isInsideBody = comment.start > body.start && comment.end < body.end;
    if (!isInsideBody) continue;
    const lineStart = text.lastIndexOf("\n", comment.start - 1) + 1;
    const nextNewline = text.indexOf("\n", comment.end);
    const lineEnd = nextNewline === -1 ? text.length : nextNewline;
    const codeBefore = text.slice(lineStart, comment.start).trim();
    const codeAfter = text.slice(comment.end, lineEnd).trim();
    const ownsItsLines = codeBefore === "" && codeAfter === "";
    if (!ownsItsLines) continue;
    for (
      let line = comment.loc.start.line;
      line <= comment.loc.end.line;
      line++
    )
      commentOnlyLines.add(line);
  }
  return commentOnlyLines.size;
}
