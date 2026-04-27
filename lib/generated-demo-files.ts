import fs from "node:fs/promises";
import path from "node:path";
import type { DynamicInteractiveDemoSpec } from "@/lib/dynamic-demo-components";

const AUTO_COMPONENT_DIR = path.join(process.cwd(), "components", "demos", "generated", "auto");
const REGISTRY_PATH = path.join(process.cwd(), "components", "demos", "generated", "registry.ts");

function sanitizeComponentName(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9]/g, "");
  const normalized = cleaned.endsWith("Demo") ? cleaned : `${cleaned}Demo`;
  return /^[A-Z]/.test(normalized) ? normalized : `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}

function buildComponentSource(spec: DynamicInteractiveDemoSpec): string {
  const componentName = sanitizeComponentName(spec.componentName);
  const specJson = JSON.stringify({ ...spec, componentName }, null, 2);

  return [
    '"use client";',
    "",
    'import { AutoInteractiveDemoRenderer } from "@/components/demos/generated/runtime/auto-interactive-demo-renderer";',
    'import type { GeneratedDemoComponentProps } from "@/components/demos/generated/registry";',
    'import type { DynamicInteractiveDemoSpec } from "@/lib/dynamic-demo-components";',
    "",
    `const spec: DynamicInteractiveDemoSpec = ${specJson};`,
    "",
    `export default function ${componentName}({ anchorId }: GeneratedDemoComponentProps) {`,
    "  return <AutoInteractiveDemoRenderer spec={spec} anchorId={anchorId} />;",
    "}",
    "",
    `export { ${componentName} };`,
    "",
  ].join("\n");
}

async function rebuildRegistry() {
  const entries = await fs.readdir(AUTO_COMPONENT_DIR, { withFileTypes: true }).catch(() => []);
  const componentFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".tsx") && entry.name !== ".gitkeep")
    .map((entry) => path.parse(entry.name).name)
    .sort((a, b) => a.localeCompare(b));

  const imports = componentFiles.map(
    (name) => `import ${name} from "@/components/demos/generated/auto/${name}";`,
  );
  const mappings = componentFiles.map((name) => `  ${JSON.stringify(name)}: ${name},`);

  const source = [
    '"use client";',
    "",
    'import type { ComponentType } from "react";',
    ...imports,
    "",
    "export type GeneratedDemoComponentProps = {",
    "  anchorId?: string;",
    "};",
    "",
    "export const GENERATED_DEMO_COMPONENTS: Record<string, ComponentType<GeneratedDemoComponentProps>> = {",
    ...mappings,
    "};",
    "",
  ].join("\n");

  await fs.mkdir(path.dirname(REGISTRY_PATH), { recursive: true });
  await fs.writeFile(REGISTRY_PATH, source, "utf8");
}

export async function materializeGeneratedDemoFiles(specs: DynamicInteractiveDemoSpec[]) {
  if (!specs.length) {
    return;
  }

  await fs.mkdir(AUTO_COMPONENT_DIR, { recursive: true });

  for (const rawSpec of specs) {
    const spec = { ...rawSpec, componentName: sanitizeComponentName(rawSpec.componentName) };
    const filePath = path.join(AUTO_COMPONENT_DIR, `${spec.componentName}.tsx`);
    await fs.writeFile(filePath, buildComponentSource(spec), "utf8");
  }

  await rebuildRegistry();
}
