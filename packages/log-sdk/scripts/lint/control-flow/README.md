# Make each decision easy to read

- `sdk/max-if-conditions`: an `if`, `while`, or `do … while` guard may contain at most two `&&` / `||` operands. Parentheses and negation do not hide extra operands.
- `sdk/max-function-lines`: a function body may span at most 50 physical lines, including braces, blank lines, and nested functions. Split responsibilities; do not compress formatting to pass. A class body follows the same 50-line limit, not counting lines that hold only comments (the public classes carry their API docs as JSDoc): move the work into top-level functions the class delegates to.
- `sdk/no-nested-ternary`: a ternary cannot contain another ternary in its condition or either result. A separately invoked function has its own control flow.

Rejected:

```ts
if (action === Action.Add && (!key || !group || (!fromStdin && !fromFile)))
  return;
const label = ready ? (failed ? "error" : "ok") : "pending";
```

Name the decisions:

```ts
const addIsMissingInput =
  action === Action.Add && (!key || !group || (!fromStdin && !fromFile));
if (addIsMissingInput) return;

const settledLabel = failed ? "error" : "ok";
const label = ready ? settledLabel : "pending";
```

- Keep a computed condition next to its branch.
- A loop condition must be recomputed on each iteration. Do not freeze it before the loop.
- Do not hoist calls from a conditional branch: the old branch might never call them.
- Extract a helper when it owns a distinct step. Keep the entry function first and helpers below it.

```ts
export function createReads(request: Request): ReadOperations {
  return {
    scan: createScan(request),
    listKeys: createListKeys(request),
    listSegments: createListSegments(request),
    count: createCount(request),
  };
}

function createScan(request: Request): ScanOperation { ... }
```

Oxlint visits branch, function, and conditional-expression nodes. Function
length measures the body rather than the signature. None of these rules
rewrites code automatically: naming, lazy evaluation, and ownership need review.

```sh
bun test scripts/lint/control-flow
bun run lint
```

Never change a threshold, disable a check, or disguise an expression to pass.
