import type { VisitorObject } from "oxlint/plugins-dev";
import type { OxlintContext, OxlintNode, OxlintRule } from "../types.ts";
import { VALUE_BINARY_OPERATORS } from "./constants.ts";
import type { ValueHelper } from "./types.ts";

export const preferLocalValue = {
  meta: {
    type: "suggestion",
    schema: [],
    messages: {
      localValue:
        "This helper has one call site and only computes a value. Move the computation into its caller and name the local result.",
    },
  },
  create(context): VisitorObject {
    return {
      FunctionDeclaration: (node): void =>
        reportSingleUseValueHelper(context, node),
      VariableDeclarator: (node): void =>
        reportSingleUseValueHelper(context, node),
    };
  },
} satisfies OxlintRule;

function reportSingleUseValueHelper(
  context: OxlintContext,
  declaration: OxlintNode,
): void {
  const candidate = valueHelperDeclaration(declaration);
  if (!candidate) return;
  const { helper, name, statement } = candidate;
  if (!helper.body) return;
  const helperCanSuspend = helper.async || helper.generator;
  if (helperCanSuspend) return;
  const isExported =
    statement.parent?.type === "ExportNamedDeclaration" ||
    statement.parent?.type === "ExportDefaultDeclaration";
  if (isExported) return;
  const isTypeGuard =
    helper.returnType?.typeAnnotation.type === "TSTypePredicate";
  if (isTypeGuard) return;
  if (!helper.params.every(isValueBinding)) return;
  if (!isValueBody(helper.body)) return;

  const variable = context.sourceCode
    .getDeclaredVariables(declaration)
    .find((candidate): boolean => candidate.identifiers.includes(name));
  if (!variable || variable.defs.length !== 1) return;
  const uses = variable.references.filter(
    (reference): boolean => !(reference.init && reference.identifier === name),
  );
  if (uses.length !== 1) return;
  const use = uses[0];
  if (!use?.isReadOnly()) return;
  const call = use.identifier.parent;
  if (call.type !== "CallExpression" || call.callee !== use.identifier) return;
  for (let parent: OxlintNode | null = call; parent; parent = parent.parent) {
    if (parent === helper) return;
  }

  if (helper.type === "FunctionExpression" && helper.id) {
    const selfName = helper.id;
    const selfBinding = context.sourceCode
      .getDeclaredVariables(helper)
      .find((candidate): boolean => candidate.identifiers.includes(selfName));
    if (selfBinding && selfBinding.references.length > 0) return;
  }
  context.report({ node: name, messageId: "localValue" });
}

function valueHelperDeclaration(
  declaration: OxlintNode,
): ValueHelper | undefined {
  if (declaration.type === "FunctionDeclaration") {
    if (!declaration.id) return undefined;
    return {
      helper: declaration,
      name: declaration.id,
      statement: declaration,
    };
  }
  if (declaration.type !== "VariableDeclarator") return undefined;
  const parent = declaration.parent;
  if (parent.type !== "VariableDeclaration" || parent.kind !== "const")
    return undefined;
  if (declaration.id.type !== "Identifier") return undefined;
  const initializer = declaration.init;
  const isFunction =
    initializer?.type === "FunctionExpression" ||
    initializer?.type === "ArrowFunctionExpression";
  if (!isFunction) return undefined;
  return { helper: initializer, name: declaration.id, statement: parent };
}

function isValueBinding(node: OxlintNode): boolean {
  switch (node.type) {
    case "Identifier":
      return node.name !== "arguments" && node.name !== "this";
    case "AssignmentPattern":
      return isValueBinding(node.left) && isValueExpression(node.right);
    case "ObjectPattern":
      return node.properties.every((property): boolean => {
        if (property.type === "RestElement")
          return isValueBinding(property.argument);
        const isValueKey =
          !property.computed || isValueExpression(property.key);
        return isValueKey && isValueBinding(property.value);
      });
    case "ArrayPattern":
      return node.elements.every(
        (element): boolean => element === null || isValueBinding(element),
      );
    case "RestElement":
      return isValueBinding(node.argument);
    default:
      return false;
  }
}

function isValueBody(body: OxlintNode): boolean {
  if (body.type !== "BlockStatement") return isValueExpression(body);
  const statements = body.body;
  const returned = statements.at(-1);
  if (returned?.type !== "ReturnStatement" || !returned.argument) return false;
  if (!isValueExpression(returned.argument)) return false;

  let bindingCount = 0;
  for (const statement of statements.slice(0, -1)) {
    if (statement.type !== "VariableDeclaration" || statement.kind !== "const")
      return false;
    for (const declaration of statement.declarations) {
      bindingCount += 1;
      if (bindingCount > 2 || declaration.id.type !== "Identifier")
        return false;
      if (!declaration.init || !isValueExpression(declaration.init))
        return false;
    }
  }
  return true;
}

function isValueExpression(node: OxlintNode): boolean {
  switch (node.type) {
    case "Literal":
      return true;
    case "Identifier":
      return node.name !== "arguments";
    case "MemberExpression":
      return (
        isValueExpression(node.object) &&
        (!node.computed || isValueExpression(node.property))
      );
    case "ChainExpression":
      return isValueExpression(node.expression);
    case "BinaryExpression": {
      const allowedOperator = VALUE_BINARY_OPERATORS.includes(node.operator);
      return (
        allowedOperator &&
        isValueExpression(node.left) &&
        isValueExpression(node.right)
      );
    }
    case "LogicalExpression":
      return isValueExpression(node.left) && isValueExpression(node.right);
    case "UnaryExpression":
      return node.operator !== "delete" && isValueExpression(node.argument);
    case "ConditionalExpression":
      return (
        isValueExpression(node.test) &&
        isValueExpression(node.consequent) &&
        isValueExpression(node.alternate)
      );
    case "TemplateLiteral":
      return node.expressions.every(isValueExpression);
    default:
      return false;
  }
}
