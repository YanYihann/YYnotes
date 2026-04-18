import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type StudyBlockProps = {
  title?: string;
  children: ReactNode;
  className?: string;
};

type Variant = "theorem" | "definition" | "example" | "warning" | "summary" | "formula" | "practice";

const variantClasses: Record<Variant, string> = {
  theorem:
    "bg-white/80 text-[#1d1d1f] dark:bg-[#272729] dark:text-white border-l-[3px] border-[#1d1d1f] dark:border-white/70",
  definition:
    "bg-white/80 text-[#1d1d1f] dark:bg-[#272729] dark:text-white border-l-[3px] border-black/50 dark:border-white/50",
  example:
    "bg-white/80 text-[#1d1d1f] dark:bg-[#272729] dark:text-white border-l-[3px] border-black/40 dark:border-white/40",
  warning:
    "bg-[#f5f5f7] text-[#1d1d1f] dark:bg-[#242426] dark:text-white border-l-[3px] border-black dark:border-white",
  summary:
    "bg-[#f5f5f7] text-[#1d1d1f] dark:bg-[#28282a] dark:text-white border-l-[3px] border-black/60 dark:border-white/60",
  formula:
    "bg-white/90 text-[#1d1d1f] dark:bg-[#2a2a2d] dark:text-white border-l-[3px] border-black/60 dark:border-white/60",
  practice:
    "bg-[#f5f5f7] text-[#1d1d1f] dark:bg-[#28282a] dark:text-white border-l-[3px] border-black dark:border-white",
};

const labels: Record<Variant, string> = {
  theorem: "Theorem",
  definition: "Definition",
  example: "Example",
  warning: "Warning",
  summary: "Summary",
  formula: "Formula",
  practice: "Practice",
};

function StudyBlock({
  title,
  children,
  className,
  variant,
}: StudyBlockProps & { variant: Variant }) {
  return (
    <section className={cn("my-8 rounded-apple px-5 py-4 shadow-card/20", variantClasses[variant], className)}>
      <p className="mb-2 font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-black/70 dark:text-white/75">
        {title ?? labels[variant]}
      </p>
      <div className="font-text text-[16px] leading-[1.6] tracking-tightBody">{children}</div>
    </section>
  );
}

export function TheoremBlock(props: StudyBlockProps) {
  return <StudyBlock variant="theorem" {...props} />;
}

export function DefinitionBlock(props: StudyBlockProps) {
  return <StudyBlock variant="definition" {...props} />;
}

export function ExampleBlock(props: StudyBlockProps) {
  return <StudyBlock variant="example" {...props} />;
}

export function WarningBlock(props: StudyBlockProps) {
  return <StudyBlock variant="warning" {...props} />;
}

export function SummaryBlock(props: StudyBlockProps) {
  return <StudyBlock variant="summary" {...props} />;
}

export function FormulaBlock(props: StudyBlockProps) {
  return <StudyBlock variant="formula" {...props} />;
}

export function PracticeQuestionBlock(props: StudyBlockProps) {
  return <StudyBlock variant="practice" {...props} />;
}

export { InteractiveDemoCard, TryThisDemoBlock } from "@/components/demos/mdx/interactive-demo-card";
