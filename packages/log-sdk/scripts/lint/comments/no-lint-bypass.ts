import { resolve } from "node:path";
import { SOURCE_DIRECTORIES } from "../constants.ts";

const root = resolve(import.meta.dirname, "../../..");
const paths = process.argv.slice(2);
const lintDisableDirectiveSearch = Bun.spawnSync(
  [
    "git",
    "grep",
    "-n",
    "-E",
    "(oxlint|eslint)-disable",
    "--",
    ...(paths.length > 0 ? paths : SOURCE_DIRECTORIES),
    ":!scripts/lint",
  ],
  { cwd: root },
);
const commentRuleBypasses = lintDisableDirectiveSearch.stdout.toString().trim();

if (commentRuleBypasses) {
  console.error(`Remove these lint-disable comments:\n${commentRuleBypasses}`);
  process.exit(1);
}
