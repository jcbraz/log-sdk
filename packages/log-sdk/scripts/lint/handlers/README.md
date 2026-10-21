# Name event handlers with handle

`sdk/handler-prefix` checks local functions passed to `addEventListener` (and
JSX `on…` props).

Rejected:

```ts
const abort = (): void => controller.abort(signal?.reason);
signal?.addEventListener("abort", abort, { once: true });
```

Accepted:

```ts
const handleCallerAbort = (): void => controller.abort(signal?.reason);
signal?.addEventListener("abort", handleCallerAbort, { once: true });
```

- Rename the binding and its references together.
- Imported callbacks keep their external names.
- Do not inline a named handler merely to evade the rule.

```sh
bun test scripts/lint/control-flow/syntax-rules.test.ts
```
