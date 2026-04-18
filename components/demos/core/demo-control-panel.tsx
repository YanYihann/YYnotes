import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type DemoControlPanelProps = {
  titleZh: string;
  titleEn: string;
  children: ReactNode;
  className?: string;
};

export function DemoControlPanel({ titleZh, titleEn, children, className }: DemoControlPanelProps) {
  return (
    <section className={cn("rounded-apple bg-white px-5 py-5 shadow-card dark:bg-[#272729] sm:px-6", className)}>
      <h2 className="font-display text-[21px] font-semibold leading-[1.19] tracking-[0.231px] text-[#1d1d1f] dark:text-white">
        {titleZh}
        <span className="ui-en ml-1 font-text text-[15px] font-normal tracking-tightCaption text-black/65 dark:text-white/68">{titleEn}</span>
      </h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}
