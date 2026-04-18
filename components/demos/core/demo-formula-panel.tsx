import type { ReactNode } from "react";
import { MathFormula } from "@/components/demos/core/math-formula";

type DemoFormulaPanelProps = {
  titleZh: string;
  titleEn: string;
  items: Array<{ zh: string; en: string; latex: string }>;
};

export function DemoFormulaPanel({ titleZh, titleEn, items }: DemoFormulaPanelProps) {
  return (
    <section className="rounded-apple bg-white px-5 py-5 shadow-card dark:bg-[#272729] sm:px-6">
      <h3 className="font-display text-[21px] font-semibold leading-[1.19] tracking-[0.231px] text-[#1d1d1f] dark:text-white">
        {titleZh}
        <span className="ui-en ml-1 font-text text-[15px] font-normal tracking-tightCaption text-black/60 dark:text-white/68">{titleEn}</span>
      </h3>
      <ul className="mt-3 space-y-3">
        {items.map((item) => (
          <li key={`${item.zh}-${item.latex}`} className="rounded-apple bg-[#f5f5f7] px-3 py-3 dark:bg-[#1f1f21]">
            <p className="font-text text-[14px] font-semibold tracking-tightCaption text-black/76 dark:text-white/82">
              {item.zh}
              <span className="ui-en ml-1 font-normal text-black/58 dark:text-white/66">{item.en}</span>
            </p>
            <MathFormula latex={item.latex} block className="mt-1 text-[13px] text-[#1d1d1f] dark:text-white" />
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
    <section className="rounded-apple bg-white px-5 py-4 shadow-card dark:bg-[#272729] sm:px-6">
      <h4 className="font-display text-[21px] font-semibold leading-[1.19] tracking-[0.231px] text-[#1d1d1f] dark:text-white">
        {titleZh}
        <span className="ui-en ml-1 font-text text-[15px] font-normal tracking-tightCaption text-black/58 dark:text-white/66">{titleEn}</span>
      </h4>
      <div className="mt-3 font-text text-[15px] leading-[1.55] tracking-tightCaption text-black/78 dark:text-white/82">{children}</div>
    </section>
  );
}
