import ts from "typescript";
import { findingAt } from "../diagnostics.ts";
import { resolvedSymbol, symbolFromPackage } from "../symbols.ts";
import { type AuditFinding, AuditRule } from "../types.ts";

export function checkContracts(
  source: ts.SourceFile,
  checker: ts.TypeChecker,
): AuditFinding[] {
  const findings: AuditFinding[] = [];
  function visit(node: ts.Node): void {
    if (ts.isTypeReferenceNode(node)) {
      const projection = checkContractProjection(node, checker);
      if (projection) findings.push(projection);
    }
    if (ts.isIndexedAccessTypeNode(node)) {
      if (isOwnedContract({ node: node.objectType, checker }))
        findings.push(
          findingAt({
            node,
            rule: AuditRule.ExplicitContracts,
            message:
              "Use a named field type or declare this contract explicitly. Indexing into an application contract hides the fields or variant being used.",
          }),
        );
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return findings;
}

function checkContractProjection(
  node: ts.TypeReferenceNode,
  checker: ts.TypeChecker,
): AuditFinding | undefined {
  const symbol = resolvedSymbol({ node: node.typeName, checker });
  if (!symbol || !["Pick", "Omit", "Extract"].includes(symbol.name))
    return undefined;
  if (!symbolFromPackage(symbol, "typescript")) return undefined;
  const contract = node.typeArguments?.[0];
  if (!contract || !isOwnedContract({ node: contract, checker }))
    return undefined;
  return findingAt({
    node,
    rule: AuditRule.ExplicitContracts,
    message:
      "Declare the fields of this application contract explicitly, or infer its complete schema. Define union variants before combining them instead of reconstructing a variant.",
  });
}

function isOwnedContract({
  node,
  checker,
  seen = new Set<ts.Symbol>(),
}: {
  node: ts.TypeNode;
  checker: ts.TypeChecker;
  seen?: Set<ts.Symbol>;
}): boolean {
  if (ts.isParenthesizedTypeNode(node))
    return isOwnedContract({ node: node.type, checker, seen });
  if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node))
    return node.types.some((type): boolean =>
      isOwnedContract({ node: type, checker, seen }),
    );
  if (ts.isTypeLiteralNode(node)) return true;
  if (!ts.isTypeReferenceNode(node)) return false;
  const symbol = resolvedSymbol({ node: node.typeName, checker });
  if (!symbol || seen.has(symbol)) return false;
  const visited = new Set([...seen, symbol]);
  return (
    symbol.declarations?.some((declaration): boolean =>
      isOwnedDeclaration(declaration, { checker, visited }),
    ) ?? false
  );
}

function isOwnedDeclaration(
  declaration: ts.Declaration,
  { checker, visited }: { checker: ts.TypeChecker; visited: Set<ts.Symbol> },
): boolean {
  const file = declaration.getSourceFile().fileName;
  if (file.includes("/node_modules/")) return false;
  if (
    ts.isInterfaceDeclaration(declaration) ||
    ts.isClassDeclaration(declaration)
  )
    return true;
  if (!ts.isTypeAliasDeclaration(declaration)) return false;
  const type = declaration.type;
  if (ts.isIndexedAccessTypeNode(type))
    return isOwnedContract({ node: type.objectType, checker, seen: visited });
  return isOwnedContract({ node: type, checker, seen: visited });
}
