"use client";

import { AutoInteractiveDemoRenderer } from "@/components/demos/generated/runtime/auto-interactive-demo-renderer";
import { GENERATED_DEMO_COMPONENTS } from "@/components/demos/generated/registry";
import { decodeDynamicDemoSpec } from "@/lib/dynamic-demo-components";

type GeneratedComponentEmbedProps = {
  componentName: string;
  encodedSpec: string;
  anchorId?: string;
};

export function GeneratedComponentEmbed({ componentName, encodedSpec, anchorId }: GeneratedComponentEmbedProps) {
  const DemoComponent = GENERATED_DEMO_COMPONENTS[componentName];

  if (DemoComponent) {
    return <DemoComponent anchorId={anchorId} />;
  }

  const spec = decodeDynamicDemoSpec(encodedSpec);
  if (!spec) {
    return null;
  }

  return <AutoInteractiveDemoRenderer spec={spec} anchorId={anchorId} />;
}
