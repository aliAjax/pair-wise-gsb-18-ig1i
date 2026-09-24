// 零额外依赖的 TS 测试入口：用 vite 自带的 esbuild 把每个测试文件
// （连同其 src 依赖）打包为自包含产物，再交给 Node 内置 node:test 运行。
import { build } from "esbuild";
import { readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "node:test";
import { spec as specReporter } from "node:test/reporters";

const root = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(root, "..");
const srcDir = path.join(projectRoot, "src");
const outDir = path.join(projectRoot, ".test-build");

async function collectTests(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await collectTests(full)));
    else if (entry.name.endsWith(".test.ts")) files.push(full);
  }
  return files;
}

const testFiles = (await collectTests(srcDir)).sort();

// 每个测试文件一个独立 bundle：测试间互不影响，node:test 作为外部模块
await build({
  entryPoints: testFiles,
  outdir: outDir,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  logLevel: "warning",
  external: ["node:*"],
  // src 源码参与打包；React 等只在 *.tsx/界面层出现，测试不会引入
  packages: "external",
});

// 告诉 Node 临时产物按 ESM 解析，避免 MODULE_TYPELESS 警告
await writeFile(path.join(outDir, "package.json"), JSON.stringify({ type: "module" }));

const compiled = testFiles.map((f) =>
  path.join(outDir, path.relative(srcDir, f).replace(/\.ts$/, ".js"))
);

let failures = 0;
const stream = run({ files: compiled, concurrency: 1 })
  .on("test:fail", () => {
    failures += 1;
  })
  .compose(new specReporter());
stream.pipe(process.stdout);

await new Promise((resolve, reject) => {
  stream.on("end", resolve);
  stream.on("error", reject);
});

await rm(outDir, { recursive: true, force: true });

if (failures > 0) process.exitCode = 1;
