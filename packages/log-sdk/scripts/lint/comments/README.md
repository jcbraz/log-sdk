# Explain behavior in code

Put decisions, ordering, errors, and effects in names and structure. A comment
must not replace a clear name or excuse a shortcut.

Rejected:

```ts
// Each padding character leaves two unused bits.
const unusedBitCount = paddingLength * 2;
```

Instead:

```ts
const unusedBitsPerPaddingCharacter = 2;
const unusedBitCount = paddingLength * unusedBitsPerPaddingCharacter;
```

## Allowed comments

- JSDoc (`/** … */`) directly above the declaration or member it documents. The
  public API ships these docs in `dist/index.d.ts`.
- An external dependency limitation that forces the adjacent code, with four
  fields, one per line:

```ts
/*
External dependency: node
Limitation: execFile terminates the child when output exceeds maxBuffer.
Consequence: Conversion uses its explicit output limit here.
Docs: https://nodejs.org/api/child_process.html#child_processexecfilefile-args-options-callback
*/
```

`External dependency` is a package in the nearest `package.json`, `node`, or
`bun`. `Docs` is a direct HTTPS link to official documentation.

- A bare `// @ts-expect-error`. Name the case instead of explaining it.
- `#__PURE__` / `@__PURE__` annotations and an SPDX header at the top of a file.
- A single-rule Biome suppression with the reason
  `External limitation documented above.`, directly after a limitation comment.

`examples/` is exempt: its comments are tutorial text for SDK users.

## Rules for agents

- Never use `oxlint-disable` or `eslint-disable`; `lint:rules` fails on them.
- Do not edit the rule or its config, or reshape code only to avoid the match.
- A genuine edge case goes to the maintainer as a proposal, not into the config.

```sh
bun run lint:rules
bun test scripts/lint/comments
```
