import type { VisitorObject } from "oxlint/plugins-dev";
import type { OxlintNode, OxlintRule } from "../types.ts";

export const noNestedTernary = {
  meta: {
    type: "suggestion",
    schema: [],
    messages: {
      nameIntermediate:
        "Name the intermediate decision instead of nesting ternaries. Keep side effects inside the branch that currently runs them.",
    },
  },
  createOnce(context): VisitorObject {
    return {
      ConditionalExpression(node): void {
        for (
          let parent: OxlintNode | null = node.parent;
          parent;
          parent = parent.parent
        ) {
          const isFunction =
            parent.type === "FunctionExpression" ||
            parent.type === "ArrowFunctionExpression";
          if (isFunction || parent.type === "FunctionDeclaration") return;
          if (parent.type !== "ConditionalExpression") continue;
          context.report({ node, messageId: "nameIntermediate" });
          return;
        }
      },
    };
  },
} satisfies OxlintRule;
