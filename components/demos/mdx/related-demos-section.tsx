import type { DemoEntry } from "@/lib/numerical/demo-catalog";
import { InteractiveDemoCard } from "@/components/demos/mdx/interactive-demo-card";

type RelatedDemosSectionProps = {
  demos: DemoEntry[];
};

export function RelatedDemosSection({ demos }: RelatedDemosSectionProps) {
  if (!demos.length) {
    return null;
  }

  return (
    <section className="mt-12 border-t border-border pt-8">
      <h2 className="font-display text-[28px] font-semibold leading-[1.14] tracking-[0.196px] text-foreground">
        对应交互实验
        <span className="ui-en ml-1 font-text text-[16px] font-normal tracking-tightCaption text-muted-foreground">Related Interactive Labs</span>
      </h2>
      <p className="mt-2 font-text text-[14px] leading-[1.45] tracking-tightCaption text-muted-foreground">
        本周知识点可直接在下面的演示中调参观察，帮助理解公式、收敛与误差结构。
        <span className="ui-en ml-1">
          These demos are mapped to this week so you can tune parameters and inspect formulas, convergence, and errors.
        </span>
      </p>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {demos.map((demo) => (
          <InteractiveDemoCard
            key={demo.id}
            href={demo.href}
            titleZh={demo.titleZh}
            titleEn={demo.titleEn}
            descriptionZh={demo.descriptionZh}
            descriptionEn={demo.descriptionEn}
          />
        ))}
      </div>
    </section>
  );
}
