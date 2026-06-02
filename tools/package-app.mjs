import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const release = resolve(dist, "PhotoPilot");

await rm(dist, { recursive: true, force: true });
await mkdir(release, { recursive: true });

for (const file of [
  "index.html",
  "styles.css",
  "app.js",
  "server.mjs",
  "README.md",
  "项目开发文档.md",
  "项目计划表.md",
  "docs/scoring-research.md",
]) {
  await copyIntoRelease(file);
}

await writeFile(
  resolve(release, "启动 PhotoPilot.bat"),
  [
    "@echo off",
    "cd /d %~dp0",
    "if exist PhotoPilot.exe (",
    "  start \"\" PhotoPilot.exe",
    ") else if exist launcher.cjs (",
    "  node launcher.cjs",
    ") else (",
    "  node server.mjs",
    ")",
    "",
  ].join("\r\n"),
  "utf8",
);

await writeFile(
  resolve(dist, "README.txt"),
  [
    "PhotoPilot AI 可运行版本",
    "",
    "Windows：双击 PhotoPilot/启动 PhotoPilot.bat。",
    "如果当前目录存在 PhotoPilot.exe，脚本会直接运行 exe；否则使用 node launcher.cjs 或 node server.mjs 启动。",
    "当未能成功生成 PhotoPilot.exe 时，需要本机已安装 Node.js。",
    "",
    "默认地址：http://127.0.0.1:5173",
  ].join("\r\n"),
  "utf8",
);

await buildExeIfPossible();

console.log(`Packaged PhotoPilot at ${release}`);

async function copyIntoRelease(file) {
  const source = resolve(root, file);
  const target = resolve(release, file);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
}

async function buildExeIfPossible() {
  const nodeExe = process.execPath;
  const target = resolve(release, "PhotoPilot.exe");
  const launcher = resolve(root, "tools/windows-launcher.cjs");
  const blob = resolve(dist, "photopilot.blob");
  const seaConfig = resolve(dist, "sea-config.json");

  if (!existsSync(nodeExe)) return;

  try {
    await writeFile(
      seaConfig,
      JSON.stringify(
        {
          main: launcher,
          output: blob,
          disableExperimentalSEAWarning: true,
        },
        null,
        2,
      ),
      "utf8",
    );
    await execFileAsync(nodeExe, ["--experimental-sea-config", seaConfig], { cwd: root });
    await copyFile(nodeExe, target);
    await injectSeaBlob(target, blob);
  } catch (error) {
    await rm(target, { force: true });
    await copyFile(launcher, resolve(release, "launcher.cjs"));
    console.warn(`Could not build SEA executable: ${error.message}`);
  } finally {
    await rm(blob, { force: true });
    await rm(seaConfig, { force: true });
  }
}

async function injectSeaBlob(target, blob) {
  const postjectCandidates = [
    resolve(root, "node_modules/postject/dist/cli.js"),
  ];
  const postject = postjectCandidates.find((candidate) => existsSync(candidate));

  if (!postject) {
    await rm(target, { force: true });
    await copyFile(resolve(root, "tools/windows-launcher.cjs"), resolve(release, "launcher.cjs"));
    console.warn("postject is not installed; copied launcher.cjs instead of injecting SEA blob.");
    return;
  }

  await execFileAsync(process.execPath, [
    postject,
    target,
    "NODE_SEA_BLOB",
    blob,
    "--sentinel-fuse",
    "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
  ]);
}
