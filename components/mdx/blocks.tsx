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
    "bg-card text-card-foreground border-l-[3px] border-foreground/70",
  definition:
    "bg-card text-card-foreground border-l-[3px] border-border",
  example:
    "bg-card text-card-foreground border-l-[3px] border-border",
  warning:
    "bg-muted text-foreground border-l-[3px] border-foreground/80",
  summary:
    "bg-muted text-foreground border-l-[3px] border-border",
  formula:
    "bg-card text-card-foreground border-l-[3px] border-border",
  practice:
    "bg-muted text-foreground border-l-[3px] border-foreground/80",
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
      <p className="mb-2 font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
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
