import { cloneElement, isValidElement } from "react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import {
  DefinitionBlock,
  ExampleBlock,
  FormulaBlock,
  InteractiveDemoCard,
  PracticeQuestionBlock,
  SummaryBlock,
  TheoremBlock,
  TryThisDemoBlock,
  WarningBlock,
} from "@/components/mdx/blocks";
import { cn } from "@/lib/utils";

const KEY_TERMS: Array<{ zh: string; en: string }> = [
  { zh: "黎曼近似", en: "Riemann Approximation" },
  { zh: "二分法", en: "Bisection Method" },
  { zh: "牛顿法", en: "Newton's Method" },
  { zh: "割线法", en: "Secant Method" },
  { zh: "穆勒法", en: "Muller Method" },
  { zh: "差商", en: "Divided Difference" },
  { zh: "拉格朗日插值", en: "Lagrange Interpolation" },
  { zh: "埃尔米特插值", en: "Hermite Interpolation" },
  { zh: "数值积分", en: "Numerical Integration" },
  { zh: "梯形公式", en: "Trapezoidal Rule" },
  { zh: "辛普森公式", en: "Simpson's Rule" },
  { zh: "龙格现象", en: "Runge Phenomenon" },
  { zh: "误差", en: "Error" },
  { zh: "收敛", en: "Convergence" },
  { zh: "迭代", en: "Iteration" },
  { zh: "雅可比迭代", en: "Jacobi Iteration" },
  { zh: "高斯-赛德尔", en: "Gauss-Seidel" },
  { zh: "线性方程组", en: "Linear System" },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const TERM_PATTERNS = Array.from(
  new Set(
    KEY_TERMS.flatMap((term) => [
      `${term.zh}（${term.en}）`,
      `${term.zh}(${term.en})`,
      term.zh,
    ]),
  ),
).sort((a, b) => b.length - a.length);

const TERM_REGEX = new RegExp(TERM_PATTERNS.map((item) => escapeRegExp(item)).join("|"), "g");

function collectText(value: ReactNode): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(collectText).join(" ");
  }

  if (isValidElement<{ children?: ReactNode }>(value)) {
    return collectText(value.props.children);
  }

  return "";
}

function detectLineLanguage(children: ReactNode): "zh" | "en" | "mixed" {
  const text = collectText(children)
    .replace(/\$[^$]*\$/g, " ")
    .replace(/`[^`]*`/g, " ")
    .trim();

  const hasChinese = /[\u4e00-\u9fff]/.test(text);
  const hasEnglish = /[A-Za-z]/.test(text);

  if (hasChinese && !hasEnglish) {
    return "zh";
  }

  if (hasEnglish && !hasChinese) {
    const looksLikeFormula =
      /[=+\-*/^<>_{}()[\]\\]|∑|∫|√|≈|≤|≥|±|\d/.test(text) &&
      !/[A-Za-z]{3,}\s+[A-Za-z]{3,}/.test(text);

    if (looksLikeFormula) {
      return "mixed";
    }

    return "en";
  }

  return "mixed";
}

function highlightTermsInString(text: string, keyPrefix: string): ReactNode[] {
  if (!text || !TERM_PATTERNS.length) {
    return [text];
  }

  const output: ReactNode[] = [];
  let lastIndex = 0;
  let matchIndex = 0;
  TERM_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null = TERM_REGEX.exec(text);
  while (match) {
    const start = match.index;
    const matched = match[0];
    const end = start + matched.length;

    if (start > lastIndex) {
      output.push(text.slice(lastIndex, start));
    }

    output.push(
      <strong key={`${keyPrefix}-${matchIndex}`} className="term-highlight">
        {matched}
      </strong>,
    );

    lastIndex = end;
    matchIndex += 1;
    match = TERM_REGEX.exec(text);
  }

  if (lastIndex < text.length) {
    output.push(text.slice(lastIndex));
  }

  return output.length ? output : [text];
}

function highlightTerms(node: ReactNode, keyPrefix = "term"): ReactNode {
  if (typeof node === "string") {
    return highlightTermsInString(node, keyPrefix);
  }

  if (typeof node === "number" || node === null || node === undefined || typeof node === "boolean") {
    return node;
  }

  if (Array.isArray(node)) {
    return node.map((child, index) => highlightTerms(child, `${keyPrefix}-${index}`));
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    if (node.type === "code" || node.type === "pre") {
      return node;
    }

    return cloneElement(node, {
      ...node.props,
      children: highlightTerms(node.props.children, `${keyPrefix}-child`),
    });
  }

  return node;
}

function getLineClass(children: ReactNode): string {
  return detectLineLanguage(children) === "en" ? "line-en" : "line-zh";
}

function Paragraph(props: ComponentPropsWithoutRef<"p">) {
  const lineClass = getLineClass(props.children);
  const children = lineClass === "line-en" ? props.children : highlightTerms(props.children, "p");
  const rest = { ...props };
  delete (rest as { children?: ReactNode }).children;
  return (
    <p
      {...rest}
      className={cn("my-5 font-text text-[17px] leading-[1.7] tracking-tightBody text-black/80 dark:text-white/85", lineClass, props.className)}
    >
      {children}
    </p>
  );
}

function H2(props: ComponentPropsWithoutRef<"h2">) {
  const lineClass = getLineClass(props.children);
  const children = lineClass === "line-en" ? props.children : highlightTerms(props.children, "h2");
  const rest = { ...props };
  delete (rest as { children?: ReactNode }).children;
  return (
    <h2
      {...rest}
      className={cn(
        "mt-14 scroll-mt-28 font-display text-[40px] font-semibold leading-[1.1] tracking-tightDisplay text-[#1d1d1f] dark:text-white",
        lineClass,
        props.className,
      )}
    >
      {children}
    </h2>
  );
}

function H3(props: ComponentPropsWithoutRef<"h3">) {
  const lineClass = getLineClass(props.children);
  const children = lineClass === "line-en" ? props.children : highlightTerms(props.children, "h3");
  const rest = { ...props };
  delete (rest as { children?: ReactNode }).children;
  return (
    <h3
      {...rest}
      className={cn(
        "mt-10 scroll-mt-28 font-display text-[28px] font-normal leading-[1.14] tracking-[0.196px] text-[#1d1d1f] dark:text-white",
        lineClass,
        props.className,
      )}
    >
      {children}
    </h3>
  );
}

function H4(props: ComponentPropsWithoutRef<"h4">) {
  const lineClass = getLineClass(props.children);
  const children = lineClass === "line-en" ? props.children : highlightTerms(props.children, "h4");
  const rest = { ...props };
  delete (rest as { children?: ReactNode }).children;
  return (
    <h4
      {...rest}
      className={cn(
        "mt-8 font-display text-[21px] font-semibold leading-[1.19] tracking-[0.231px] text-[#1d1d1f] dark:text-white",
        lineClass,
        props.className,
      )}
    >
      {children}
    </h4>
  );
}

function UL(props: ComponentPropsWithoutRef<"ul">) {
  return <ul {...props} className={cn("my-5 list-disc space-y-2 pl-6 text-[17px] leading-[1.6] text-black/80 dark:text-white/85", props.className)} />;
}

function OL(props: ComponentPropsWithoutRef<"ol">) {
  return <ol {...props} className={cn("my-5 list-decimal space-y-2 pl-6 text-[17px] leading-[1.6] text-black/80 dark:text-white/85", props.className)} />;
}

function LI(props: ComponentPropsWithoutRef<"li">) {
  const lineClass = getLineClass(props.children);
  const children = lineClass === "line-en" ? props.children : highlightTerms(props.children, "li");
  const rest = { ...props };
  delete (rest as { children?: ReactNode }).children;
  return (
    <li {...rest} className={cn("pl-1", lineClass, props.className)}>
      {children}
    </li>
  );
}

function A(props: ComponentPropsWithoutRef<"a">) {
  return (
    <a
      {...props}
      className={cn(
        "text-[#0066cc] underline-offset-4 transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent dark:text-[#2997ff]",
        props.className,
      )}
    />
  );
}

function Blockquote(props: ComponentPropsWithoutRef<"blockquote">) {
  const children = highlightTerms(props.children, "quote");
  const rest = { ...props };
  delete (rest as { children?: ReactNode }).children;

  return (
    <blockquote
      {...rest}
      className={cn(
        "my-7 rounded-apple border-l-[3px] border-black/50 bg-white/60 px-4 py-3 text-[16px] italic leading-[1.6] text-black/75 dark:border-white/50 dark:bg-[#272729] dark:text-white/80",
        props.className,
      )}
    >
      {children}
    </blockquote>
  );
}

function Pre(props: ComponentPropsWithoutRef<"pre">) {
  return (
    <pre
      {...props}
      className={cn(
        "my-7 overflow-x-auto rounded-apple bg-[#1d1d1f] px-4 py-4 font-mono text-[14px] leading-[1.55] text-white shadow-card",
        props.className,
      )}
    />
  );
}

function Code(props: ComponentPropsWithoutRef<"code">) {
  return (
    <code
      {...props}
      className={cn(
        "rounded bg-black/[0.06] px-1.5 py-0.5 font-mono text-[14px] text-[#1d1d1f] dark:bg-white/[0.12] dark:text-white",
        props.className,
      )}
    />
  );
}

function Table(props: ComponentPropsWithoutRef<"table">) {
  return <table {...props} className={cn("my-7 w-full border-collapse overflow-hidden rounded-apple bg-white/80 text-left text-[15px] dark:bg-[#272729]", props.className)} />;
}

function TH(props: ComponentPropsWithoutRef<"th">) {
  return (
    <th
      {...props}
      className={cn(
        "border-b border-black/10 px-4 py-2 font-text text-[14px] font-semibold tracking-tightCaption text-black/80 dark:border-white/15 dark:text-white/85",
        props.className,
      )}
    />
  );
}

function TD(props: ComponentPropsWithoutRef<"td">) {
  return <td {...props} className={cn("border-b border-black/10 px-4 py-2 text-[15px] text-black/75 dark:border-white/10 dark:text-white/80", props.className)} />;
}

const components = {
  p: Paragraph,
  h2: H2,
  h3: H3,
  h4: H4,
  ul: UL,
  ol: OL,
  li: LI,
  a: A,
  blockquote: Blockquote,
  pre: Pre,
  code: Code,
  table: Table,
  th: TH,
  td: TD,
  TheoremBlock,
  DefinitionBlock,
  ExampleBlock,
  WarningBlock,
  SummaryBlock,
  FormulaBlock,
  PracticeQuestionBlock,
  InteractiveDemoCard,
  TryThisDemoBlock,
};

export default components;
