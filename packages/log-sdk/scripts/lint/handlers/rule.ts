import type { VisitorObject } from "oxlint/plugins-dev";
import type { OxlintContext, OxlintNode, OxlintRule } from "../types.ts";

export const handlerPrefix = {
  meta: {
    type: "suggestion",
    schema: [],
    messages: {
      handleName:
        "Name this local event callback handle… so its role is clear at the declaration and call site.",
    },
  },
  createOnce(context): VisitorObject {
    return {
      JSXAttribute(node): void {
        if (node.name.type !== "JSXIdentifier") return;
        if (!/^on[A-Z]/.test(node.name.name)) return;
        if (node.value?.type !== "JSXExpressionContainer") return;
        reportLocalHandler(context, node.value.expression);
      },
      CallExpression(node): void {
        if (node.callee.type !== "MemberExpression") return;
        const property = node.callee.property;
        const name = node.callee.computed
          ? property.type === "Literal" && property.value
          : property.type === "Identifier" && property.name;
        if (name !== "addEventListener") return;
        const handler = node.arguments[1];
        if (handler) reportLocalHandler(context, handler);
      },
    };
  },
} satisfies OxlintRule;

function reportLocalHandler(context: OxlintContext, handler: OxlintNode): void {
  if (handler.type !== "Identifier" || /^handle(?:[A-Z]|$)/.test(handler.name))
    return;
  let scope = context.sourceCode.getScope(handler);
  for (;;) {
    const binding = scope.set.get(handler.name);
    if (binding) {
      const definition = binding.defs[0];
      if (definition?.type === "FunctionName") {
        context.report({ node: handler, messageId: "handleName" });
        return;
      }
      if (definition?.type !== "Variable") return;
      if (definition.node.type !== "VariableDeclarator") return;
      const value = definition.node.init;
      const isLocalCallback =
        value?.type === "ArrowFunctionExpression" ||
        value?.type === "FunctionExpression";
      if (isLocalCallback)
        context.report({ node: handler, messageId: "handleName" });
      return;
    }
    if (!scope.upper) return;
    scope = scope.upper;
  }
}
