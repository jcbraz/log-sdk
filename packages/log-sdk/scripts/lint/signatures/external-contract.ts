import ts from "typescript";

export function followsExternalContract({
  node,
  checker,
}: {
  node: ts.SignatureDeclaration;
  checker: ts.TypeChecker;
}): boolean {
  const owner = node.parent;
  const isClassMember =
    ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node);
  if (isClassMember && ts.isClassLike(owner))
    return extendsExternalMember({ owner, node, checker });
  if (ts.isMethodDeclaration(node) && ts.isObjectLiteralExpression(owner))
    return hasExternalProperty({
      type: checker.getContextualType(owner),
      name: node.name,
    });
  return hasExternalContextualSignature({ node, checker });
}

function hasExternalContextualSignature({
  node,
  checker,
}: {
  node: ts.SignatureDeclaration;
  checker: ts.TypeChecker;
}): boolean {
  const contextual = checker.getContextualType(node as ts.Expression);
  return typeParts(contextual).some((part): boolean =>
    part
      .getCallSignatures()
      .some((signature): boolean =>
        isExternalDeclaration(signature.declaration),
      ),
  );
}

function hasExternalProperty({
  type,
  name,
}: {
  type: ts.Type | undefined;
  name: ts.PropertyName;
}): boolean {
  const isNamed = ts.isIdentifier(name) || ts.isStringLiteral(name);
  if (!isNamed) return false;
  return typeParts(type).some((part): boolean =>
    (part.getProperty(name.text)?.declarations ?? []).some(
      isExternalDeclaration,
    ),
  );
}

function extendsExternalMember({
  owner,
  node,
  checker,
}: {
  owner: ts.ClassLikeDeclaration;
  node: ts.MethodDeclaration | ts.ConstructorDeclaration;
  checker: ts.TypeChecker;
}): boolean {
  const bases = (owner.heritageClauses ?? []).flatMap((clause): ts.Type[] =>
    clause.types.map((base): ts.Type => checker.getTypeAtLocation(base)),
  );
  if (ts.isConstructorDeclaration(node))
    return bases.some((base): boolean =>
      base
        .getConstructSignatures()
        .some((signature): boolean =>
          isExternalDeclaration(signature.declaration),
        ),
    );
  const method = node;
  return bases.some((base): boolean =>
    hasExternalProperty({ type: base, name: method.name }),
  );
}

function typeParts(type: ts.Type | undefined): ts.Type[] {
  if (!type) return [];
  return type.isUnion() ? type.types : [type];
}

function isExternalDeclaration(declaration: ts.Node | undefined): boolean {
  return (
    declaration
      ?.getSourceFile()
      .fileName.replaceAll("\\", "/")
      .includes("/node_modules/") ?? false
  );
}
