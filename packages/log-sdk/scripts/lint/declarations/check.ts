import ts from "typescript";
import { findingAt } from "../diagnostics.ts";
import { resolvedSymbol } from "../symbols.ts";
import { type AuditFinding, AuditRule } from "../types.ts";
import {
  isConstantModule,
  isFixedData,
  isTestFile,
  isTypeModule,
} from "./classification.ts";

export function checkDeclarations(
  source: ts.SourceFile,
  checker: ts.TypeChecker,
): AuditFinding[] {
  const findings = [
    ...checkTypeCount(source),
    ...checkConstantCount(source, checker),
  ];
  const typeModule = isTypeModule(source);
  const constantModule = isConstantModule(source);
  if (!typeModule && !constantModule) return findings;
  for (const statement of source.statements) {
    if (isDedicatedModuleStatementAllowed(statement, { checker, typeModule }))
      continue;
    findings.push(
      findingAt({
        node: statement,
        rule: AuditRule.DedicatedModuleContents,
        message: typeModule
          ? "Keep type declarations and supporting schemas in types modules. Move runtime behavior or fixed data to its feature implementation or constants module."
          : "Keep fixed data in constants modules. Move types, schemas, and runtime behavior to their feature modules.",
      }),
    );
  }
  return findings;
}

function checkTypeCount(source: ts.SourceFile): AuditFinding[] {
  if (isTypeModule(source)) return [];
  const types = source.statements.filter(isTypeDeclaration);
  const firstExtra = types[3];
  if (!firstExtra) return [];
  return [
    findingAt({
      node: firstExtra,
      rule: AuditRule.TypePlacement,
      message: `This module declares ${types.length} types. Move the group into sibling types.ts or focused modules under types/.`,
    }),
  ];
}

function checkConstantCount(
  source: ts.SourceFile,
  checker: ts.TypeChecker,
): AuditFinding[] {
  if (isConstantModule(source) || isTestFile(source, checker)) return [];
  const constants = source.statements.flatMap((statement): ts.Node[] =>
    fixedDataBindings(statement, checker),
  );
  const firstExtra = constants[3];
  if (!firstExtra) return [];
  return [
    findingAt({
      node: firstExtra,
      rule: AuditRule.ConstantPlacement,
      message: `This module declares ${constants.length} fixed-data constants. Move the group into sibling constants.ts or focused modules under constants/.`,
    }),
  ];
}

function isTypeDeclaration(statement: ts.Statement): boolean {
  const isNamedType =
    ts.isTypeAliasDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement);
  return isNamedType || ts.isEnumDeclaration(statement);
}

function fixedDataBindings(
  statement: ts.Statement,
  checker: ts.TypeChecker,
): ts.Node[] {
  if (!ts.isVariableStatement(statement)) return [];
  if (!(statement.declarationList.flags & ts.NodeFlags.Const)) return [];
  return statement.declarationList.declarations.flatMap(
    (declaration): ts.Node[] => {
      if (!declaration.initializer) return [];
      if (!isFixedData({ expression: declaration.initializer, checker }))
        return [];
      if (ts.isIdentifier(declaration.name)) return [declaration];
      return collectBindingNames(declaration.name);
    },
  );
}

function collectBindingNames(name: ts.BindingName): ts.Node[] {
  if (ts.isIdentifier(name)) return [name];
  return name.elements.flatMap((element): ts.Node[] =>
    ts.isBindingElement(element) ? collectBindingNames(element.name) : [],
  );
}

function isDedicatedModuleStatementAllowed(
  statement: ts.Statement,
  context: { checker: ts.TypeChecker; typeModule: boolean },
): boolean {
  const { checker, typeModule } = context;
  const isModuleSyntax =
    ts.isImportDeclaration(statement) || ts.isEmptyStatement(statement);
  const isAllowedDeclaration =
    isModuleSyntax || (typeModule && isTypeDeclaration(statement));
  if (isAllowedDeclaration) return true;
  if (ts.isExportDeclaration(statement))
    return exportsMatchModule(statement, context);
  if (typeModule) return false;
  if (ts.isExportAssignment(statement))
    return isFixedData({ expression: statement.expression, checker });
  if (!ts.isVariableStatement(statement)) return false;
  if (!(statement.declarationList.flags & ts.NodeFlags.Const)) return false;
  return statement.declarationList.declarations.every(
    (declaration): boolean => {
      if (!declaration.initializer) return false;
      return isFixedData({ expression: declaration.initializer, checker });
    },
  );
}

function exportsMatchModule(
  statement: ts.ExportDeclaration,
  { checker, typeModule }: { checker: ts.TypeChecker; typeModule: boolean },
): boolean {
  if (statement.isTypeOnly) return true;
  const exports = statement.exportClause;
  if (!exports || !ts.isNamedExports(exports)) return false;
  return exports.elements.every((element): boolean => {
    if (element.isTypeOnly) return true;
    const symbol = resolvedSymbol({ node: element.name, checker });
    if (!symbol) return false;
    if (typeModule)
      return Boolean(
        symbol.flags &
        (ts.SymbolFlags.TypeAlias |
          ts.SymbolFlags.Interface |
          ts.SymbolFlags.Enum),
      );
    const declaration = symbol.valueDeclaration;
    if (!declaration || !ts.isVariableDeclaration(declaration)) return false;
    const initializer = declaration.initializer;
    return (
      initializer !== undefined &&
      isFixedData({ expression: initializer, checker })
    );
  });
}
