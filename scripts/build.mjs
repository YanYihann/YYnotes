import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const rootDir = process.cwd();
const deployTarget = (process.env.DEPLOY_TARGET ?? "").trim().toLowerCase();
const isStaticExport = deployTarget === "github-pages" || deployTarget === "cloudflare-pages";
const appApiDir = path.join(rootDir, "app", "api");
const tempApiDir = path.join(rootDir, ".tmp-static-export-app-api");

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function runNextBuild() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["./node_modules/next/dist/bin/next", "build"], {
      cwd: rootDir,
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`next build exited via signal ${signal}`));
        return;
      }

      resolve(code ?? 1);
    });
  });
}

let movedApiDir = false;

try {
  if (isStaticExport && (await pathExists(appApiDir))) {
    if (await pathExists(tempApiDir)) {
      await fs.rm(tempApiDir, { recursive: true, force: true });
    }

    await fs.rename(appApiDir, tempApiDir);
    movedApiDir = true;
  }

  const exitCode = await runNextBuild();
  process.exitCode = exitCode;
} finally {
  if (movedApiDir && (await pathExists(tempApiDir))) {
    await fs.mkdir(path.dirname(appApiDir), { recursive: true });
    await fs.rename(tempApiDir, appApiDir);
  }
}
