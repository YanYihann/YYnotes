import type { ReactNode } from "react";
import { MathFormula } from "@/components/demos/core/math-formula";

type DemoFormulaPanelProps = {
  titleZh: string;
  titleEn: string;
  items: Array<{ zh: string; en: string; latex: string }>;
};

export function DemoFormulaPanel({ titleZh, titleEn, items }: DemoFormulaPanelProps) {
  return (
    <section className="rounded-apple bg-card px-5 py-5 text-card-foreground shadow-card sm:px-6">
      <h3 className="font-display text-[21px] font-semibold leading-[1.19] tracking-[0.231px] text-foreground">
        {titleZh}
        <span className="ui-en ml-1 font-text text-[15px] font-normal tracking-tightCaption text-muted-foreground">{titleEn}</span>
      </h3>
      <ul className="mt-3 space-y-3">
        {items.map((item) => (
          <li key={`${item.zh}-${item.latex}`} className="rounded-apple bg-[#f5f5f7] px-3 py-3 dark:bg-[#1f1f21]">
            <p className="font-text text-[14px] font-semibold tracking-tightCaption text-muted-foreground">
              {item.zh}
              <span className="ui-en ml-1 font-normal text-muted-foreground">{item.en}</span>
            </p>
            <MathFormula latex={item.latex} block className="mt-1 text-[13px] text-foreground" />
          </li>
        ))}
      </ul>
    </section>
  );
}

type StepExplanationCardProps = {
  titleZh: string;
  titleEn: string;
  children: ReactNode;
};

export function StepExplanationCard({ titleZh, titleEn, children }: StepExplanationCardProps) {
  return (
    <section className="rounded-apple bg-card px-5 py-4 text-card-foreground shadow-card sm:px-6">
      <h4 className="font-display text-[21px] font-semibold leading-[1.19] tracking-[0.231px] text-foreground">
        {titleZh}
        <span className="ui-en ml-1 font-text text-[15px] font-normal tracking-tightCaption text-muted-foreground">{titleEn}</span>
      </h4>
      <div className="mt-3 font-text text-[15px] leading-[1.55] tracking-tightCaption text-muted-foreground">{children}</div>
    </section>
  );
}
