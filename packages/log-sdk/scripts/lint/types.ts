import type { RuleTester } from "oxlint/plugins-dev";

export type OxlintRule = Parameters<RuleTester["run"]>[1];
export type OxlintContext = Parameters<
  Extract<OxlintRule, { create: unknown }>["create"]
>[0];
export type OxlintNode = Parameters<OxlintContext["sourceCode"]["getScope"]>[0];
export type OxlintComment = ReturnType<
  OxlintContext["sourceCode"]["getAllComments"]
>[number];

export enum AuditRule {
  ExplicitSignatures = "sdk/explicit-signatures",
  TypePlacement = "sdk/type-placement",
  ConstantPlacement = "sdk/constant-placement",
  DedicatedModuleContents = "sdk/dedicated-module-contents",
  ExplicitContracts = "sdk/explicit-contracts",
  MaxPositionalParams = "sdk/max-positional-params",
  FolderFileCount = "sdk/folder-file-count",
}

export type AuditFinding = {
  rule: AuditRule;
  file: string;
  line: number;
  column: number;
  start: number;
  end: number;
  message: string;
};
