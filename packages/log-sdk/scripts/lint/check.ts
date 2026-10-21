import { resolve } from "node:path";
import { SOURCE_DIRECTORIES } from "./constants.ts";

const root = resolve(import.meta.dirname, "../..");
const args = process.argv.slice(2);
const configArg = args.find((arg): boolean => arg.startsWith("--config="));
const config = resolve(
  root,
  configArg?.slice("--config=".length) ?? ".oxlintrc.json",
);
const paths = args.filter((arg): boolean => arg !== configArg);
const child = Bun.spawn(
  [
    "node",
    resolve(root, "node_modules/oxlint/bin/oxlint"),
    "--config",
    config,
    ...(paths.length > 0 ? paths : SOURCE_DIRECTORIES),
  ],
  { cwd: root, stdin: "inherit", stdout: "inherit", stderr: "inherit" },
);

process.exit(await child.exited);
