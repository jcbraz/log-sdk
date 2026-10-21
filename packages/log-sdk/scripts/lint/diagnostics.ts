import type ts from "typescript";
import type { AuditFinding, AuditRule } from "./types.ts";

export function findingAt({
  node,
  rule,
  message,
}: {
  node: ts.Node;
  rule: AuditRule;
  message: string;
}): AuditFinding {
  const source = node.getSourceFile();
  const start = node.getStart(source);
  const { line, character } = source.getLineAndCharacterOfPosition(start);
  return {
    rule,
    file: source.fileName,
    line: line + 1,
    column: character + 1,
    start,
    end: node.end,
    message,
  };
}
