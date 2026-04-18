import katex from "katex";
import { cn } from "@/lib/utils";

type MathFormulaProps = {
  latex: string;
  block?: boolean;
  className?: string;
};

export function MathFormula({ latex, block = false, className }: MathFormulaProps) {
  const html = katex.renderToString(latex, {
    displayMode: block,
    throwOnError: false,
    strict: "ignore",
  });

  return (
    <span
      className={cn(block ? "block overflow-x-auto" : "inline-block", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
