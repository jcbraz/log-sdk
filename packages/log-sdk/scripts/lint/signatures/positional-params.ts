import ts from "typescript";
import { findingAt } from "../diagnostics.ts";
import { type AuditFinding, AuditRule } from "../types.ts";
import { followsExternalContract } from "./external-contract.ts";

export function checkPositionalParams({
  source,
  checker,
  publicEntry,
}: {
  source: ts.SourceFile;
  checker: ts.TypeChecker;
  publicEntry: ts.SourceFile | undefined;
}): AuditFinding[] {
  const publicClasses = exportedClasses({ entry: publicEntry, checker });
  const findings: AuditFinding[] = [];
  if (!/\.[cm]?tsx?$/.test(source.fileName)) return findings;
  function visit(node: ts.Node): void {
    if (ts.isFunctionLike(node) && hasTooManyParams(node)) {
      const isExempt =
        followsExternalContract({ node, checker }) ||
        isReleasedPublicMember({ node, publicClasses, checker });
      if (!isExempt)
        findings.push(
          findingAt({
            node: node.parameters[2] as ts.Node,
            rule: AuditRule.MaxPositionalParams,
            message: `This function takes ${positionalParams(node).length} positional parameters; the limit is 2. Take one destructured object, \`({ a, b, c }: { a: A; b: B; c: C })\`, so call sites name each argument. A signature dictated by a library is exempt.`,
          }),
        );
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return findings;
}

function positionalParams(
  node: ts.SignatureDeclaration,
): ts.ParameterDeclaration[] {
  return node.parameters.filter(
    (param): boolean =>
      !(ts.isIdentifier(param.name) && param.name.text === "this"),
  );
}

function hasTooManyParams(node: ts.SignatureDeclaration): boolean {
  const isImplementation =
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node);
  return isImplementation && positionalParams(node).length > 2;
}

function exportedClasses({
  entry,
  checker,
}: {
  entry: ts.SourceFile | undefined;
  checker: ts.TypeChecker;
}): Set<ts.Symbol> {
  const entrySymbol = entry && checker.getSymbolAtLocation(entry);
  if (!entrySymbol) return new Set();
  const exported = checker
    .getExportsOfModule(entrySymbol)
    .map(
      (symbol): ts.Symbol =>
        symbol.flags & ts.SymbolFlags.Alias
          ? checker.getAliasedSymbol(symbol)
          : symbol,
    )
    .filter((symbol): boolean => (symbol.flags & ts.SymbolFlags.Class) !== 0);
  return new Set(exported);
}

function isReleasedPublicMember({
  node,
  publicClasses,
  checker,
}: {
  node: ts.SignatureDeclaration;
  publicClasses: ReadonlySet<ts.Symbol>;
  checker: ts.TypeChecker;
}): boolean {
  const isClassMember =
    ts.isConstructorDeclaration(node) || ts.isMethodDeclaration(node);
  const owner = node.parent;
  if (!isClassMember || !ts.isClassDeclaration(owner)) return false;
  const isPrivateMember =
    (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Private) !== 0 ||
    (node.name !== undefined && ts.isPrivateIdentifier(node.name));
  const ownerSymbol = owner.name && checker.getSymbolAtLocation(owner.name);
  const isPublishedClass =
    ownerSymbol !== undefined && publicClasses.has(ownerSymbol);
  return isPublishedClass && !isPrivateMember;
}
