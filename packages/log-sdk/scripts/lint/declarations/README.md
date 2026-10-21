# Keep declarations near their feature

Up to three type declarations and up to three fixed-data constants may stay in
an implementation module. Count each group independently. A fourth moves that
group to the feature's `types.ts` or `constants.ts`:

```text
src/stream/
  types.ts
  append.ts
  scan.ts
  follow.ts
```

An enum counts as a type. Exporting a declaration or moving it below a function
does not change the count. `const a = 1, b = 2` holds two constants.

- `types.ts` and modules under `types/` hold unlimited types and nothing else.
- `constants.ts` and modules under `constants/` hold unlimited fixed data and
  nothing else.
- Test data in a file that calls `test`, `it`, `describe` or `suite` does not
  count toward constants. Test types still count.
- Fixed data is literals, static arrays/objects, templates, and expressions
  over other constants. Calls, construction and functions are runtime values.

Moving code can change import cycles and initialization order, so the rule does
not move declarations for you.

```sh
bun run lint:contracts
bun test scripts/lint/declarations
```
