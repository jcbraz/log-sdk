import ts from "typescript";

export function resolvedSymbol({
  node,
  checker,
  seen = new Set<ts.Symbol>(),
}: {
  node: ts.Node;
  checker: ts.TypeChecker;
  seen?: Set<ts.Symbol>;
}): ts.Symbol | undefined {
  let symbol = checker.getSymbolAtLocation(node);
  if (!symbol && ts.isElementAccessExpression(node)) {
    const key = checker.getTypeAtLocation(node.argumentExpression);
    if (key.isStringLiteral())
      symbol = checker
        .getTypeAtLocation(node.expression)
        .getProperty(key.value);
  }
  if (!symbol) return undefined;
  const resolved =
    symbol.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(symbol)
      : symbol;
  if (seen.has(resolved)) return resolved;
  const declaration = resolved.valueDeclaration;
  if (!declaration || !ts.isVariableDeclaration(declaration)) return resolved;
  const list = declaration.parent;
  if (!ts.isVariableDeclarationList(list) || !(list.flags & ts.NodeFlags.Const))
    return resolved;
  const initializer = declaration.initializer;
  const isAlias =
    initializer &&
    (ts.isIdentifier(initializer) ||
      ts.isPropertyAccessExpression(initializer) ||
      ts.isElementAccessExpression(initializer));
  return isAlias
    ? (resolvedSymbol({
        node: initializer,
        checker,
        seen: new Set([...seen, resolved]),
      }) ?? resolved)
    : resolved;
}

export function symbolFromPackage(
  symbol: ts.Symbol | undefined,
  name: string,
): boolean {
  return (
    symbol?.declarations?.some((declaration): boolean =>
      declaration
        .getSourceFile()
        .fileName.replaceAll("\\", "/")
        .includes(`/node_modules/${name}/`),
    ) ?? false
  );
}
