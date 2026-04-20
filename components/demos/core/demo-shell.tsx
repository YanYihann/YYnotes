import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type DemoShellProps = {
  titleZh: string;
  titleEn: string;
  subtitleZh: string;
  subtitleEn: string;
  children: ReactNode;
  className?: string;
};

export function DemoShell({ titleZh, titleEn, subtitleZh, subtitleEn, children, className }: DemoShellProps) {
  return (
    <div className={cn("section-light py-12", className)}>
      <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6">
        <header className="mb-8 rounded-apple bg-card px-6 py-6 text-card-foreground shadow-card sm:px-8">
          <p className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Interactive Numerical Analysis
            <span className="ui-en ml-1">Study Lab</span>
          </p>
          <h1 className="mt-3 font-display text-[clamp(2rem,5vw,3.3rem)] font-semibold leading-[1.07] tracking-tightDisplay text-foreground">
            {titleZh}
            <span className="ui-en mt-1 block text-[0.42em] font-normal text-muted-foreground">{titleEn}</span>
          </h1>
          <p className="mt-4 max-w-[880px] font-text text-[17px] leading-[1.47] tracking-tightBody text-muted-foreground">
            {subtitleZh}
            <span className="ui-en ml-1">{subtitleEn}</span>
          </p>
        </header>

        {children}
      </div>
    </div>
  );
}
