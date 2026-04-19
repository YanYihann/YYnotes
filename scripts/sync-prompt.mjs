import fs from "node:fs/promises";
import path from "node:path";

const rootPromptPath = path.join(process.cwd(), "prompt.md");
const publicPromptPath = path.join(process.cwd(), "public", "prompt.md");

async function main() {
  const rootPrompt = await fs.readFile(rootPromptPath, "utf8");
  const normalized = rootPrompt.trim();

  if (!normalized) {
    throw new Error("Root prompt.md is empty. Sync stopped.");
  }

  await fs.mkdir(path.dirname(publicPromptPath), { recursive: true });

  let previous = "";
  try {
    previous = await fs.readFile(publicPromptPath, "utf8");
  } catch {
    previous = "";
  }

  if (previous === rootPrompt) {
    console.log("prompt.md already synced to public/prompt.md");
    return;
  }

  await fs.writeFile(publicPromptPath, rootPrompt, "utf8");
  console.log("synced prompt.md -> public/prompt.md");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`sync-prompt failed: ${message}`);
  process.exit(1);
});
