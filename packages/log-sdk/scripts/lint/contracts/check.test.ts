import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { fixtureProgram } from "../testing/typescript.ts";
import { AuditRule } from "../types.ts";
import { checkContracts } from "./check.ts";

const fixtures = [
  {
    name: "application declaration-file contracts still have an owner",
    file: "owned/declared.ts",
    source:
      "import type { DeclaredInput } from '../shared/declared'; type Input = Pick<DeclaredInput, 'id'>;",
    rules: [AuditRule.ExplicitContracts],
    at: "Pick<DeclaredInput, 'id'>",
  },
  {
    name: "an unrelated infer type",
    file: "valid/unrelated.ts",
    source:
      "namespace local { export type infer<T> = T; } type Value = local.infer<string>;",
    rules: [],
  },
  {
    name: "Pick of a local object",
    file: "owned/pick.ts",
    source:
      "type Request = { id: string; text: string }; type Input = Pick<Request, 'id'>;",
    rules: [AuditRule.ExplicitContracts],
    at: "Pick<Request, 'id'>",
  },
  {
    name: "Omit of an interface",
    file: "owned/omit.ts",
    source:
      "interface Request { id: string; text: string } type Input = Omit<Request, 'text'>;",
    rules: [AuditRule.ExplicitContracts],
    at: "Omit<Request, 'text'>",
  },
  {
    name: "Extract of a discriminated union",
    file: "owned/extract.ts",
    source:
      "type Document = { kind: 'indexed'; pages: string[] } | { kind: 'materialized'; path: string }; type Indexed = Extract<Document, { kind: 'indexed' }>;",
    rules: [AuditRule.ExplicitContracts],
    at: "Extract<Document, { kind: 'indexed' }>",
  },
  {
    name: "indexed field projection",
    file: "owned/indexed.ts",
    source:
      "type Document = { reason?: string }; type Reason = NonNullable<Document['reason']>;",
    rules: [AuditRule.ExplicitContracts],
    at: "Document['reason']",
  },
  {
    name: "imported application contract",
    file: "owned/imported.ts",
    source:
      "import type { Contract as Request } from '../shared/types'; type Input = Pick<Request, 'id'>;",
    rules: [AuditRule.ExplicitContracts],
    at: "Pick<Request, 'id'>",
  },
  {
    name: "application alias chain",
    file: "owned/alias.ts",
    source:
      "type Request = { id: string }; type Renamed = Request; type Input = Pick<Renamed, 'id'>;",
    rules: [AuditRule.ExplicitContracts],
    at: "Pick<Renamed, 'id'>",
  },
  {
    name: "whole named fields and variant unions",
    file: "valid/composition.ts",
    source:
      "type SearchScope = { matterId: string }; type Request = { scope: SearchScope }; type Other = { id: number }; type Choice = Request | Other;",
    rules: [],
  },
  {
    name: "external API contract projection",
    file: "external/options.ts",
    source:
      "import type { Options } from 'fixture-sdk'; type Request = Pick<Options, 'token'>;",
    rules: [],
  },
  {
    name: "alias of an external API contract",
    file: "external/alias.ts",
    source:
      "import type { Options } from 'fixture-sdk'; type Renamed = Options; type Request = Pick<Renamed, 'token'>;",
    rules: [],
  },
  {
    name: "framework callback type operations",
    file: "external/callback.ts",
    source:
      "import type { Options } from 'fixture-sdk'; type Request = Parameters<(value: Options) => void>[0];",
    rules: [],
  },
  {
    name: "a local type named Pick",
    file: "external/shadowed.ts",
    source:
      "type Pick<T, K> = { original: T; key: K }; type Request = { id: string }; type Input = Pick<Request, 'id'>;",
    rules: [],
  },
  {
    name: "indexed SDK aliases remain external contracts",
    file: "external/indexed-alias.ts",
    source:
      "import type { Options } from 'fixture-sdk'; type Callback = Parameters<(value: Options) => void>[0]; type Request = Pick<Callback, 'token'>;",
    rules: [],
  },
  {
    name: "nested SDK type operations remain external",
    file: "external/nested-alias.ts",
    source:
      "import type { Factory } from 'fixture-sdk'; type Definition = Parameters<Factory['run']>[0]; type Request = Extract<Definition, { create: unknown }>; type Create = Request['create'];",
    rules: [],
  },
];

const { program, root } = fixtureProgram({
  ...Object.fromEntries(
    fixtures.map((fixture): [string, string] => [fixture.file, fixture.source]),
  ),
  "shared/types.ts": "export type Contract = { id: string; text: string };",
  "shared/declared.d.ts":
    "export type DeclaredInput = { id: string; text: string };",
  "node_modules/fixture-sdk/index.d.ts":
    "export type Options = { token: string; retries: number }; export type Factory = { run(rule: { create: (value: Options) => void }): void };",
});
const checker = program.getTypeChecker();

test.each(fixtures)("contracts: $name", (fixture): void => {
  const source = program.getSourceFile(resolve(root, fixture.file));
  if (!source) throw new Error(`Missing fixture ${fixture.file}`);
  const findings = checkContracts(source, checker);
  expect(findings.map((finding): AuditRule => finding.rule)).toEqual(
    fixture.rules,
  );
  if (fixture.at) {
    expect(findings).toHaveLength(1);
    expect(findings[0]?.start).toBe(fixture.source.indexOf(fixture.at));
    expect(findings[0]?.end).toBe(
      fixture.source.indexOf(fixture.at) + fixture.at.length,
    );
  }
});
