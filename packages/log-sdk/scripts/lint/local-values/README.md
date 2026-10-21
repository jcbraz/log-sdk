# Keep simple values with their caller

Rejected:

```ts
function isConflict(error: ApplicationError) {
  return error.code === ErrorCode.Conflict;
}

const retry = isConflict(error);
```

Accepted:

```ts
const retry = error.code === ErrorCode.Conflict;
```

`sdk/prefer-local-value` catches small private functions that make the reader
leave the caller just to understand a value. One call site can execute many
times; move the computation into that caller, preserving when it runs.

## How it works

Oxlint visits function declarations and variables initialized with functions.
The rule reads Oxlint's declared variables and resolved references. Identical
spelling in another scope does not add a use to this binding.

The candidate must be a private synchronous function declaration or a `const`
function expression. It must have exactly one binding use, a direct call
outside its own body. Exports, callbacks, returned functions, reassignment,
recursion, overloads, type predicates, assertion signatures, generators, and
`this` or `arguments` dependencies are excluded.

The body is an expression, or at most two initialized `const` bindings followed
by a return. Its expressions and parameter defaults may contain literals,
identifiers, property reads, arithmetic, comparisons, boolean operators,
templates, and conditional expressions. Calls, construction, mutation, loops,
nested functions, and error handling are excluded. The recursive expression
check is an explicit allowlist; new syntax remains outside the rule until its
behavior has been considered and covered by a fixture.

The diagnostic points at the helper name. There is no automatic fix. Argument
evaluation, property getters, local scope, and inferred types can affect a manual
rewrite. This syntax check does not prove purity or that every larger single-use
helper should disappear.

## Running and extending it

```sh
bun run lint:rules
bun test scripts/lint/local-values
```

To extend the policy, add a short rejected case and its nearest allowed case to
`rule.test.ts`, update the relevant condition in `rule.ts`, run the fixtures,
then inspect real findings. Keep reference resolution native to Oxlint.
