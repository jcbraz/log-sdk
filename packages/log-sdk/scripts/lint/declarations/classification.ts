import ts from "typescript";
import { resolvedSymbol } from "../symbols.ts";

export function isTypeModule(source: ts.SourceFile): boolean {
  const withinWorkspace = source.fileName
    .replaceAll("\\", "/")
    .replace(/^.*\/(?:apps|packages|adapters)\/[^/]+\//, "");
  return /(?:^|\/)types(?:\/[^/]+)*\.[cm]?tsx?$/.test(withinWorkspace);
}

export function isConstantModule(source: ts.SourceFile): boolean {
  const withinWorkspace = source.fileName
    .replaceAll("\\", "/")
    .replace(/^.*\/(?:apps|packages|adapters)\/[^/]+\//, "");
  return /(?:^|\/)constants(?:\/[^/]+)*\.[cm]?tsx?$/.test(withinWorkspace);
}

export function isTestFile(
  source: ts.SourceFile,
  checker: ts.TypeChecker,
): boolean {
  const runners = findTestRunnerBindings(source, checker);
  let hasTest = false;
  function visit(node: ts.Node): void {
    if (hasTest) return;
    if (ts.isCallExpression(node)) {
      hasTest = isTestRunnerCall({ node, runners, checker });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return hasTest;
}

function findTestRunnerBindings(
  source: ts.SourceFile,
  checker: ts.TypeChecker,
): Map<ts.Symbol, boolean> {
  const runners = new Map<ts.Symbol, boolean>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const isRunner = [
      "bun:test",
      "node:test",
      "vitest",
      "@jest/globals",
    ].includes(statement.moduleSpecifier.text);
    if (!isRunner) continue;
    const clause = statement.importClause;
    if (!clause || clause.isTypeOnly) continue;
    const imports = clause.namedBindings;
    const names: ts.Identifier[] = [];
    if (clause.name) names.push(clause.name);
    if (imports && ts.isNamespaceImport(imports)) names.push(imports.name);
    if (imports && ts.isNamedImports(imports)) {
      for (const imported of imports.elements) {
        const name = imported.propertyName?.text ?? imported.name.text;
        if (
          !imported.isTypeOnly &&
          ["test", "it", "describe", "suite"].includes(name)
        )
          names.push(imported.name);
      }
    }
    for (const name of names) {
      const symbol = checker.getSymbolAtLocation(name);
      if (symbol)
        runners.set(
          symbol,
          imports !== undefined && ts.isNamespaceImport(imports),
        );
    }
  }
  return runners;
}

function isTestRunnerCall({
  node,
  runners,
  checker,
}: {
  node: ts.CallExpression;
  runners: ReadonlyMap<ts.Symbol, boolean>;
  checker: ts.TypeChecker;
}): boolean {
  let called = node.expression;
  let namespaceMethod: string | undefined;
  for (;;) {
    if (ts.isPropertyAccessExpression(called)) {
      namespaceMethod = called.name.text;
      called = called.expression;
      continue;
    }
    if (ts.isElementAccessExpression(called)) {
      const key = checker.getTypeAtLocation(called.argumentExpression);
      namespaceMethod = key.isStringLiteral() ? key.value : undefined;
      called = called.expression;
      continue;
    }
    if (!ts.isCallExpression(called)) break;
    called = called.expression;
  }
  const symbol = checker.getSymbolAtLocation(called);
  if (symbol && runners.has(symbol)) {
    const isNamespace = runners.get(symbol);
    return (
      !isNamespace ||
      ["test", "it", "describe", "suite"].includes(namespaceMethod ?? "")
    );
  }
  return false;
}

export function isFixedData({
  expression,
  checker,
  seen = new Set<ts.Symbol>(),
}: {
  expression: ts.Expression;
  checker: ts.TypeChecker;
  seen?: Set<ts.Symbol>;
}): boolean {
  const isLiteralValue =
    ts.isLiteralExpression(expression) ||
    expression.kind === ts.SyntaxKind.TrueKeyword ||
    expression.kind === ts.SyntaxKind.FalseKeyword ||
    expression.kind === ts.SyntaxKind.NullKeyword;
  if (isLiteralValue) return true;
  const isTransparentExpression =
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression);
  if (isTransparentExpression)
    return isFixedData({ expression: expression.expression, checker, seen });
  if (ts.isArrayLiteralExpression(expression))
    return expression.elements.every((item): boolean =>
      isFixedData({
        expression: ts.isSpreadElement(item) ? item.expression : item,
        checker,
        seen,
      }),
    );
  if (ts.isObjectLiteralExpression(expression))
    return expression.properties.every((property): boolean =>
      isFixedProperty({ property, checker, seen }),
    );
  if (
    ts.isPropertyAccessExpression(expression) ||
    ts.isElementAccessExpression(expression)
  ) {
    return isFixedMember({ expression, checker, seen });
  }
  if (ts.isIdentifier(expression)) {
    const binding = checker.getSymbolAtLocation(expression);
    const symbol =
      binding && binding.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(binding)
        : binding;
    return symbol !== undefined && fixedBinding({ symbol, checker, seen });
  }
  return isFixedOperation({ expression, checker, seen });
}

function isFixedMember({
  expression,
  checker,
  seen,
}: {
  expression: ts.PropertyAccessExpression | ts.ElementAccessExpression;
  checker: ts.TypeChecker;
  seen: Set<ts.Symbol>;
}): boolean {
  const symbol = resolvedSymbol({ node: expression, checker });
  if (symbol?.flags && symbol.flags & ts.SymbolFlags.EnumMember) return true;
  const declaration = symbol?.valueDeclaration;
  const isStaticKey =
    ts.isPropertyAccessExpression(expression) ||
    isFixedData({ expression: expression.argumentExpression, checker, seen });
  return (
    isStaticKey &&
    declaration !== undefined &&
    ts.isPropertyAssignment(declaration) &&
    isFixedData({ expression: expression.expression, checker, seen }) &&
    isFixedData({ expression: declaration.initializer, checker, seen })
  );
}

function isFixedProperty({
  property,
  checker,
  seen,
}: {
  property: ts.ObjectLiteralElementLike;
  checker: ts.TypeChecker;
  seen: Set<ts.Symbol>;
}): boolean {
  if (ts.isSpreadAssignment(property))
    return isFixedData({ expression: property.expression, checker, seen });
  if (ts.isShorthandPropertyAssignment(property)) {
    const value = checker.getShorthandAssignmentValueSymbol(property);
    return (
      value !== undefined && fixedBinding({ symbol: value, checker, seen })
    );
  }
  if (!ts.isPropertyAssignment(property)) return false;
  const isStaticKey =
    !ts.isComputedPropertyName(property.name) ||
    isFixedData({ expression: property.name.expression, checker, seen });
  return (
    isStaticKey &&
    isFixedData({ expression: property.initializer, checker, seen })
  );
}

function isFixedOperation({
  expression,
  checker,
  seen,
}: {
  expression: ts.Expression;
  checker: ts.TypeChecker;
  seen: Set<ts.Symbol>;
}): boolean {
  if (ts.isPrefixUnaryExpression(expression)) {
    const operator = expression.operator;
    if (
      operator === ts.SyntaxKind.PlusPlusToken ||
      operator === ts.SyntaxKind.MinusMinusToken
    )
      return false;
    return isFixedData({ expression: expression.operand, checker, seen });
  }
  if (ts.isBinaryExpression(expression)) {
    const operator = expression.operatorToken.kind;
    if (
      operator >= ts.SyntaxKind.FirstAssignment &&
      operator <= ts.SyntaxKind.LastAssignment
    )
      return false;
    if (operator === ts.SyntaxKind.CommaToken) return false;
    return (
      isFixedData({ expression: expression.left, checker, seen }) &&
      isFixedData({ expression: expression.right, checker, seen })
    );
  }
  if (ts.isConditionalExpression(expression))
    return (
      isFixedData({ expression: expression.condition, checker, seen }) &&
      isFixedData({ expression: expression.whenTrue, checker, seen }) &&
      isFixedData({ expression: expression.whenFalse, checker, seen })
    );
  if (ts.isTemplateExpression(expression))
    return expression.templateSpans.every((span): boolean =>
      isFixedData({ expression: span.expression, checker, seen }),
    );
  return false;
}

function fixedBinding({
  symbol,
  checker,
  seen,
}: {
  symbol: ts.Symbol;
  checker: ts.TypeChecker;
  seen: ReadonlySet<ts.Symbol>;
}): boolean {
  if (seen.has(symbol)) return false;
  const declaration = symbol.valueDeclaration;
  if (!declaration || !ts.isVariableDeclaration(declaration)) return false;
  const list = declaration.parent;
  if (!ts.isVariableDeclarationList(list) || !(list.flags & ts.NodeFlags.Const))
    return false;
  if (!declaration.initializer) return false;
  return isFixedData({
    expression: declaration.initializer,
    checker,
    seen: new Set([...seen, symbol]),
  });
}
