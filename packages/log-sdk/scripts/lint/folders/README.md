# Group files into subfolders

A folder may hold up to 20 implementation files. The 21st means the folder
mixes responsibilities: group related files into subfolders, the way
`src/client/request/` holds the request lifecycle.

Tests and fixtures (`*.test.*`, `*.fixture.*`, `*.integration.*`,
`*.compile.*`, `*.test-support.*`) do not count. Each subfolder has its own
count. Do not split a folder into a single catch-all subfolder.

```sh
bun run lint:contracts
bun test scripts/lint/folders
```
