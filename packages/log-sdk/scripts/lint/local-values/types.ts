import type { FunctionType } from "oxlint/plugins-dev";
import type { OxlintNode } from "../types.ts";

export type ValueHelper = {
  helper: Extract<
    OxlintNode,
    {
      type: FunctionType | "ArrowFunctionExpression";
    }
  >;
  name: Extract<OxlintNode, { type: "Identifier" }>;
  statement: OxlintNode;
};
