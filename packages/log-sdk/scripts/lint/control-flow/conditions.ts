import type { VisitorObject } from "oxlint/plugins-dev";
import type { OxlintNode, OxlintRule } from "../types.ts";

export const maxIfConditions = {
  meta: {
    type: "suggestion",
    schema: [],
    messages: {
      nameDecision:
        "Name this decision before the branch. An if or while condition may contain at most two logical operands.",
    },
  },
  createOnce(context): VisitorObject {
    return {
      "IfStatement, WhileStatement, DoWhileStatement"(node): void {
        const isBranch =
          node.type === "IfStatement" || node.type === "WhileStatement";
        if (!isBranch && node.type !== "DoWhileStatement") return;
        if (countLogicalOperands(node.test) <= 2) return;
        context.report({ node: node.test, messageId: "nameDecision" });
      },
    };
  },
} satisfies OxlintRule;

function countLogicalOperands(node: OxlintNode): number {
  const isTypeAssertion =
    node.type === "TSAsExpression" || node.type === "TSTypeAssertion";
  const isTransparentWrapper =
    node.type === "TSNonNullExpression" ||
    node.type === "TSSatisfiesExpression";
  if (isTypeAssertion || isTransparentWrapper)
    return countLogicalOperands(node.expression);
  if (node.type === "UnaryExpression" && node.operator === "!")
    return countLogicalOperands(node.argument);
  const isLogicalCondition =
    node.type === "LogicalExpression" && node.operator !== "??";
  if (!isLogicalCondition) return 1;
  return countLogicalOperands(node.left) + countLogicalOperands(node.right);
}
