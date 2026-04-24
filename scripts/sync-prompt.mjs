import fs from "node:fs/promises";
import path from "node:path";

const promptFiles = [
  { root: path.join(process.cwd(), "prompt.md"), public: path.join(process.cwd(), "public", "prompt.md") },
  { root: path.join(process.cwd(), "prompt2.md"), public: path.join(process.cwd(), "public", "prompt2.md") },
];

async function main() {
  for (const item of promptFiles) {
    const rootPrompt = await fs.readFile(item.root, "utf8");
    const normalized = rootPrompt.trim();

    if (!normalized) {
      throw new Error(`${path.basename(item.root)} is empty. Sync stopped.`);
    }

    await fs.mkdir(path.dirname(item.public), { recursive: true });

    let previous = "";
    try {
      previous = await fs.readFile(item.public, "utf8");
    } catch {
      previous = "";
    }

    if (previous === rootPrompt) {
      console.log(`${path.basename(item.root)} already synced to public/${path.basename(item.public)}`);
      continue;
    }

    await fs.writeFile(item.public, rootPrompt, "utf8");
    console.log(`synced ${path.basename(item.root)} -> public/${path.basename(item.public)}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`sync-prompt failed: ${message}`);
  process.exit(1);
});
