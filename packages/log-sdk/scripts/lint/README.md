# Readable code checks

Ported from the Athena monorepo's `scripts/lint` and adapted to this
dependency-free SDK. Every check runs in `bun run lint` (and in CI through
`turbo run lint`).

- Fix the code when a check fails. Do not remove, loosen, bypass, or suppress a
  check to make a change pass.
- Change a policy only with the maintainer's explicit approval. A shortcut is
  not an edge case.

| Check                                              | Tool             | Guide                                  |
| -------------------------------------------------- | ---------------- | -------------------------------------- |
| General correctness, style and import order        | Biome            | [biome.json](../../biome.json)         |
| Formatting                                         | Prettier         | `lint:format`                          |
| Named conditions, short functions, direct branches | Oxlint plugin    | [Control flow](control-flow/README.md) |
| Single-use value helpers                           | Oxlint plugin    | [Local values](local-values/README.md) |
| Comments only for API docs or external limits      | Oxlint plugin    | [Comments](comments/README.md)         |
| Event callback names                               | Oxlint plugin    | [Handlers](handlers/README.md)         |
| Explicit signatures and parameter limit            | TypeScript audit | [Signatures](signatures/README.md)     |
| Named contracts instead of projections             | TypeScript audit | [Contracts](contracts/README.md)       |
| Type and constant placement                        | TypeScript audit | [Declarations](declarations/README.md) |
| Files per folder                                   | TypeScript audit | [Folders](folders/README.md)           |

```sh
bun run lint            # format, Biome, Oxlint rules, lint-bypass guard, TypeScript audit
bun run lint:rules      # Oxlint plugin + lint-bypass guard
bun run lint:contracts  # TypeScript audit
bun test scripts/lint   # rule fixtures (also part of bun run test)
tsc -p scripts/lint     # type-check the rules (also part of bun run typecheck)
```

Findings fail the command. There is no baseline.

## Scope

`src`, `test`, `examples` and `scripts` are checked, including these rules.

- `examples/` keeps its tutorial comments: the comment rule is off there.
- Type tests (`*.compile.ts`) assert inferred public signatures, so they are
  outside the TypeScript audit. Biome, Prettier and the Oxlint rules still apply.
- The TypeScript audit needs `dist/` for the examples' `opendata-log` import;
  turbo builds first.

## Add a check

- Prefer a shipped Biome rule when it expresses the exact policy.
- Keep a custom rule with focused fixtures: syntax checks in `oxlint-plugin.ts`,
  semantic checks in `typescript-audit.ts`.
- Test distinct failures and valid near-misses. Do not copy the rule's message
  or logic into the expectation.
- Audit, fix, then enforce. Preserve runtime behavior while removing findings.
