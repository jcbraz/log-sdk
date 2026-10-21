# Name contracts instead of projecting them

`sdk/explicit-contracts` rejects `Pick`, `Omit`, `Extract` and indexed access
(`Log["scan"]`) on types this package owns. A projection hides which fields a
caller depends on and silently follows changes to the source type.

Rejected:

```ts
function createScan({ client }: { client: Pick<Log, "scan"> }) {}
const outcome: AppendError["outcome"] = "unknown";
```

Accepted:

```ts
export interface StreamClient {
  append: AppendOperation;
  scan: ScanOperation;
}
function createScan({ client }: { client: StreamClient }): StreamScan<T> {}
const outcome: AppendOutcome = "unknown";
```

- Whole named types can be fields. Do not copy their structure into every
  containing object.
- Contracts from `node_modules` (DOM, Node, libraries) stay valid.
- TypeScript resolves the real utility types, so an unrelated `Pick` does not
  match.

```sh
bun run lint:contracts
bun test scripts/lint/contracts
```
