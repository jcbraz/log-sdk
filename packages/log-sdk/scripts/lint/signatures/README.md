# Declare function inputs and outputs

`sdk/explicit-signatures` requires return annotations on TypeScript function
bodies, including arrows, callbacks and methods. Constructors and setters
cannot declare return types.

Rejected:

```ts
export function configureRequest(options: ClientOptions) {
  return { baseURL, headers, fetch, timeoutMs };
}
type Config = ReturnType<typeof configureRequest>;
```

Declare the contract in the feature's type module, then use it:

```ts
export interface RequestConfig {
  baseURL: URL;
  headers: Headers;
  fetch: typeof globalThis.fetch;
  timeoutMs: number;
}

export function configureRequest(options: ClientOptions): RequestConfig {}
```

- Use `void`, `boolean`, or another simple type for a simple result, and
  `Promise<T>` at a promise boundary.
- Do not derive a contract from a function with `Parameters<typeof …>` or
  `ReturnType<typeof …>`.
- Reuse the library's named contract at boundaries (`RequestInfo | URL`, not
  `Parameters<typeof fetch>[0]`).
- Preserve generic relationships and type predicates.

## Take one object after two parameters

`sdk/max-positional-params` rejects a function with more than two parameters.
Three positional arguments hide which value is which, and reordering them
breaks silently when the types match.

Rejected:

```ts
function readFailure(
  operation: ReadOperation,
  Cause: ErrorClass,
  inspect?: Inspect,
) {}
```

Accepted:

```ts
function readFailure({
  operation,
  Cause,
  inspect,
}: {
  operation: ReadOperation;
  Cause: ErrorClass;
  inspect?: Inspect;
}): FailureCheck {}
```

- Applies to declarations, expressions, arrows, methods and constructors. A
  TypeScript `this` parameter does not count.
- A signature dictated by a library is exempt: `reduce((total, item, index) => …)`,
  a `JSON.parse` reviver, a `Proxy` trap.
- A constructor or non-private method of a class exported from `src/index.ts`
  keeps its released signature (`new LogStream(client, key, codec)`). Changing
  it is a breaking change; do it in a major release, not to satisfy the rule.
- A callback for a type we own is not exempt. Update every call site in the
  same change.

```sh
bun run lint:contracts
bun test scripts/lint/signatures
```
