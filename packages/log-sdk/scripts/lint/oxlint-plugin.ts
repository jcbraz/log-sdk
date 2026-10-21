import { externalDependencyComments } from "./comments/rule.ts";
import { maxIfConditions } from "./control-flow/conditions.ts";
import { maxFunctionLines } from "./control-flow/function-lines.ts";
import { noNestedTernary } from "./control-flow/ternary.ts";
import { handlerPrefix } from "./handlers/rule.ts";
import { preferLocalValue } from "./local-values/rule.ts";

export default {
  meta: { name: "sdk" },
  rules: {
    "max-if-conditions": maxIfConditions,
    "max-function-lines": maxFunctionLines,
    "no-nested-ternary": noNestedTernary,
    "handler-prefix": handlerPrefix,
    "external-dependency-comments": externalDependencyComments,
    "prefer-local-value": preferLocalValue,
  },
};
