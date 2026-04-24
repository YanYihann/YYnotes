"use client";

import { DifferentiationDemo, IntegrationComparisonDemo, IntegrationDemo, RombergDemo } from "@/components/demos/pages";
import { INTERACTIVE_DEMO_REGISTRY } from "@/lib/interactive-demos";

type InteractiveDemoEmbedProps = {
  demoKey: string;
  anchorId?: string;
};

const DEMO_COMPONENTS = {
  differentiation: DifferentiationDemo,
  integration: IntegrationDemo,
  "integration-comparison": IntegrationComparisonDemo,
  romberg: RombergDemo,
} as const;

export function InteractiveDemoEmbed({ demoKey, anchorId }: InteractiveDemoEmbedProps) {
  const DemoComponent = DEMO_COMPONENTS[demoKey as keyof typeof DEMO_COMPONENTS];
  const demo = INTERACTIVE_DEMO_REGISTRY.find((item) => item.key === demoKey);

  if (!DemoComponent || !demo) {
    return null;
  }

  return (
    <section id={anchorId} className="my-6 rounded-apple border border-border bg-card px-5 py-5 shadow-card">
      <p className="font-text text-[13px] leading-[1.45] text-muted-foreground">
        {demo.descriptionZh}
        <span className="ui-en ml-1">{demo.descriptionEn}</span>
      </p>
      <div className="mt-5">
        <DemoComponent />
      </div>
    </section>
  );
}
