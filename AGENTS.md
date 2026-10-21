<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

# opendata-log SDK

Typed, dependency-free TypeScript client for self-hosted OpenData Log. One
published package: `packages/log-sdk` (`opendata-log`). Bun + Turborepo.

## Before you open a PR

Run from the repo root. CI runs the same tasks.

```sh
bun run build
bun run typecheck
bun run test
bun run lint
bun run check:package
```

`bun run test:integration` needs a server (`LOG_BASE_URL`); CI starts the
pinned Docker image.

## Hard rules

- **Zero runtime dependencies.** `dependencies` stays empty. Build, test and
  lint tools go in `devDependencies`.
- **Never change lint rules without the maintainer's explicit permission.**
  That covers `packages/log-sdk/scripts/lint`, `.oxlintrc.json`, `biome.json`
  and the Prettier setup. If a rule blocks you, fix the code. No
  `oxlint-disable` / `eslint-disable` comments. See
  [the lint guide](packages/log-sdk/scripts/lint/README.md).
- **No behavior changes in cleanups.** Preserve evaluation order, error types,
  error messages and the released public API (`src/index.ts`).

## Code style

Reader first, for humans and agents. Low cognitive load beats cleverness.

- **Name decisions.** Put conditions in named booleans; at most two `&&`/`||`
  operands per `if`/`while`; no nested ternaries.

  ```ts
  // Bad
  if (!isText || cached?.value !== value || bytes.length > max) { ... }

  // Good
  const isCallerMutableBytes = typeof value !== "string";
  if (isCallerMutableBytes) return encodeBytes(value);
  ```

- **Name what a value means**, not its shape: `latestTextKey`, not `cache`;
  `startSequence`, not `pos`.
- **Functions stay under 50 lines.** Newspaper style: entry function first,
  helpers below in call order. Split by responsibility, not by line count.
- **Inline simple logic.** A pure helper with one call site moves into its
  caller as a named local (`sdk/prefer-local-value`).
- **One clear call shape.** More than two parameters means one destructured
  object, so every argument has a name at the call site.
- **Explicit contracts.** Every function declares its return type. Structured
  contracts are named types in the feature's `types.ts`; no `Pick`, `Omit`,
  `Extract`, indexed access or `ReturnType<typeof …>` on our own types.
- **Declarative over imperative.** Prefer `map`/`filter` and pure functions
  that compute the next value; perform side effects at the boundary.
- **Use `switch`** when many value-based branches make a decision hard to scan.
- **Run independent async work in parallel** (`Promise.all`); keep it
  sequential when order matters or one call needs another's result.
- **Reuse first.** Search `src/` before adding a helper, type or constant. Two
  drifting implementations are worse than either alone.
- **Comments:** JSDoc on public API members, and comments for external
  dependency limitations in the four-field format. Everything else belongs in
  names and structure.

### SDK conventions

- Sequences are `bigint` at the API surface; numbers are accepted only as safe
  integers.
- Every public `Log` and `LogStream` member has JSDoc with `@param`,
  `@returns` and `@throws`.
- Failures are typed `LogError` subclasses. Wrap at the operation boundary
  (`runRead`, `runAppend`); keep the original error as `cause`. Never swallow
  an error.
- Validate caller input before dispatch so failures report `not-sent`.

## Tests

- Tautological tests are harmful. Do not test what the compiler or a
  dependency already guarantees.
- Unit tests cover protocol decoding, validation and data transformations:
  the happy path, its variations and edge cases.
- Integration tests run against the pinned server; prefer them for end-to-end
  behavior.
- Type tests (`test/types.compile.ts`) pin the public signatures.

## Communication and PRs

- Direct and concise. Examples and code beat paragraphs.
- Conventional commit titles: `feat(client): …`, `fix(stream): …`,
  `chore(lint): …`.
- PR body: **Problem** (one short bullet per problem) and **Solution** (the
  approach, why it fits, trade-offs, and the files a reviewer should read).
