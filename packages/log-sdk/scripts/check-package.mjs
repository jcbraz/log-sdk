import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = mkdtempSync(join(tmpdir(), "opendata-log-package-"));
try {
  execFileSync(
    "bun",
    ["pm", "pack", "--destination", temporary, "--ignore-scripts"],
    {
      cwd: packageDirectory,
      stdio: "pipe",
    },
  );
  const manifest = JSON.parse(
    readFileSync(join(packageDirectory, "package.json"), "utf8"),
  );
  const tarball = join(temporary, `${manifest.name}-${manifest.version}.tgz`);
  execFileSync("bunx", ["--no-install", "attw", tarball], {
    cwd: packageDirectory,
    stdio: "inherit",
  });
  const files = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" })
    .trim()
    .split("\n");
  const unexpected = files.filter(
    (file) =>
      !/^package\/(?:dist\/|package\.json$|README\.md$|LICENSE$)/.test(file),
  );
  assert.deepEqual(
    unexpected,
    [],
    "Tarball must contain only public distribution files",
  );
  const consumer = join(temporary, "consumer");
  const installed = join(consumer, "node_modules", manifest.name);
  mkdirSync(installed, { recursive: true });
  execFileSync("tar", [
    "-xzf",
    tarball,
    "--strip-components=1",
    "-C",
    installed,
  ]);
  writeFileSync(
    join(consumer, "package.json"),
    JSON.stringify({ type: "module" }),
  );
  const smoke = `
    const client = new Log({baseURL:'http://localhost:8080',fetch:async()=>new Response('{"status":"success","count":9007199254740993}')});
    const result = await client.count({key:'orders'});
    if (result.count !== 9007199254740993n) throw new Error('Integer precision lost');
    if (typeof client.stream('orders').follow !== 'function') throw new Error('Missing stream interface');
    const failing = new Log({baseURL:'http://localhost:8080',fetch:async()=>new Response('rejected',{status:400})});
    try {
      await failing.append({records:[{key:'orders',value:'event'}]});
      throw new Error('Append should fail');
    } catch (error) {
      if (!(error instanceof AppendError) || !(error instanceof OperationError)) throw error;
      if (error.operation !== 'append' || error.outcome !== 'unknown') throw new Error('Missing append context');
      if (!(error.cause instanceof HttpError) || error.cause.status !== 400) throw new Error('Missing HTTP cause');
    }
    try {
      await failing.count({key:'orders'});
      throw new Error('Read should fail');
    } catch (error) {
      if (!(error instanceof ReadError) || error.operation !== 'count') throw error;
      if (!(error.cause instanceof HttpError)) throw new Error('Missing read cause');
    }
  `;
  const imports = "Log,AppendError,ReadError,OperationError,HttpError";
  writeFileSync(
    join(consumer, "esm.mjs"),
    `import {${imports}} from 'opendata-log';\n${smoke}`,
  );
  writeFileSync(
    join(consumer, "commonjs.cjs"),
    `const {${imports}}=require('opendata-log');\n(async()=>{${smoke}})().catch(error=>{console.error(error);process.exitCode=1});`,
  );
  for (const runtime of ["node", "bun"]) {
    for (const file of ["esm.mjs", "commonjs.cjs"]) {
      execFileSync(runtime, [file], { cwd: consumer, stdio: "inherit" });
    }
  }
  const typeSource = `
    import {Log,jsonCodec,AppendError,ReadError,EventEncodingError,EventDecodingError,type Codec,type LogEntry,type AppendOutcome,type ReadOperation} from 'opendata-log';
    const log = new Log({baseURL:'http://localhost:8080'});
    const stream = log.stream('orders',jsonCodec((value:unknown)=>String(value)));
    const entry: Promise<IteratorResult<LogEntry<string>>> = stream.follow()[Symbol.asyncIterator]().next();
    const codec: Codec<string> = jsonCodec<string>();
    const append = new AppendError({outcome:'not-sent',cause:new EventEncodingError({index:0,cause:new Error('bad event')})});
    const outcome: AppendOutcome = append.outcome;
    const read = new ReadError({operation:'follow',cause:new EventDecodingError({sequence:1n,cause:new Error('bad event')})});
    const operation: ReadOperation = read.operation;
    void outcome; void operation;
    void entry; void codec;
  `;
  writeFileSync(join(consumer, "types.mts"), typeSource);
  writeFileSync(join(consumer, "types.cts"), typeSource);
  const tsc = resolve(packageDirectory, "node_modules/typescript/bin/tsc");
  for (const [module, resolution, file] of [
    ["NodeNext", "NodeNext", "types.mts"],
    ["NodeNext", "NodeNext", "types.cts"],
    ["ESNext", "Bundler", "types.mts"],
  ]) {
    execFileSync(
      "node",
      [
        tsc,
        "--noEmit",
        "--strict",
        "--target",
        "ES2022",
        "--module",
        module,
        "--moduleResolution",
        resolution,
        file,
      ],
      {
        cwd: consumer,
        stdio: "inherit",
      },
    );
  }
  console.log(
    `Packed ${manifest.name}@${manifest.version}: ${files.length} files; Node/Bun ESM/CJS and TypeScript NodeNext/Bundler passed`,
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
