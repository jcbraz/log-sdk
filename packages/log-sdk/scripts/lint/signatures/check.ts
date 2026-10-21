import ts from "typescript";
import { findingAt } from "../diagnostics.ts";
import { resolvedSymbol, symbolFromPackage } from "../symbols.ts";
import { type AuditFinding, AuditRule } from "../types.ts";

export function checkSignatures(
  source: ts.SourceFile,
  checker: ts.TypeChecker,
): AuditFinding[] {
  const findings: AuditFinding[] = [];
  if (!/\.[cm]?tsx?$/.test(source.fileName)) return findings;
  function visit(node: ts.Node): void {
    if (hasMissingReturnType(node)) {
      findings.push(
        findingAt({
          node,
          rule: AuditRule.ExplicitSignatures,
          message:
            "Declare this function's return type. Use a named feature contract for structured output.",
        }),
      );
    }
    if (ts.isTypeReferenceNode(node)) {
      const symbol = resolvedSymbol({ node: node.typeName, checker });
      const extractsFunctionSignature =
        symbol !== undefined &&
        ["Parameters", "ReturnType"].includes(symbol.name);
      const queriesFunction = node.typeArguments?.some(queriesFunctionType);
      const isBuiltin = symbolFromPackage(symbol, "typescript");
      const derivesSignature =
        extractsFunctionSignature && queriesFunction && isBuiltin;
      if (derivesSignature)
        findings.push(
          findingAt({
            node,
            rule: AuditRule.ExplicitSignatures,
            message:
              "Name the input or output contract explicitly instead of deriving it from a function implementation.",
          }),
        );
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return findings;
}

function queriesFunctionType(node: ts.TypeNode): boolean {
  if (ts.isTypeQueryNode(node)) return true;
  if (ts.isParenthesizedTypeNode(node)) return queriesFunctionType(node.type);
  if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node))
    return node.types.some(queriesFunctionType);
  return false;
}

function hasMissingReturnType(node: ts.Node): boolean {
  const isFunction =
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node);
  const isMethod =
    ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node);
  if (!isFunction && !isMethod) return false;
  return node.body !== undefined && node.type === undefined;
}
