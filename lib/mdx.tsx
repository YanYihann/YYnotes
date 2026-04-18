import ReactMarkdown from "react-markdown";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { WeekNote } from "@/lib/content";
import allComponents from "@/components/mdx/mdx-components";

const markdownComponents = {
  p: allComponents.p,
  h2: allComponents.h2,
  h3: allComponents.h3,
  h4: allComponents.h4,
  ul: allComponents.ul,
  ol: allComponents.ol,
  li: allComponents.li,
  a: allComponents.a,
  blockquote: allComponents.blockquote,
  pre: allComponents.pre,
  code: allComponents.code,
  table: allComponents.table,
  th: allComponents.th,
  td: allComponents.td,
};

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

function normalizeLineForLanguage(line: string): string {
  return line
    .replace(/^\s*#{1,6}\s+/, "")
    .replace(/^\s*>\s?/, "")
    .replace(/^\s*[-*+]\s+/, "")
    .replace(/^\s*\d+\.\s+/, "")
    .replace(/`[^`]*`/g, " ")
    .replace(/\$[^$]*\$/g, " ")
    .trim();
}

function isFormulaOnlyLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }

  // Keep fenced/block directives out of formula checks.
  if (/^(```|\$\$|#{1,6}\s|>\s|[-*+]\s|\d+\.\s)/.test(trimmed)) {
    return false;
  }

  if (/^\$[^$][\s\S]*\$$/.test(trimmed) || /^\\\[[\s\S]*\\\]$/.test(trimmed) || /^\\\([\s\S]*\\\)$/.test(trimmed)) {
    return true;
  }

  const hasChinese = /[\u4e00-\u9fff]/.test(trimmed);
  const hasLetters = /[A-Za-z]/.test(trimmed);
  const hasMathSignal = /[=+\-*/^<>_{}()[\]\\]|∑|∫|√|≈|≤|≥|±|\d/.test(trimmed);

  // Symbol-heavy lines with no Chinese are treated as formula lines.
  return !hasChinese && hasLetters && hasMathSignal && !/[A-Za-z]{3,}\s+[A-Za-z]{3,}/.test(trimmed);
}

function formulaSignature(line: string): string {
  const trimmed = line.trim();

  const inlineMathSegments = Array.from(trimmed.matchAll(/\$([^$]+)\$/g)).map((match) => match[1].replace(/\s+/g, ""));
  if (inlineMathSegments.length > 0) {
    return inlineMathSegments.join("|");
  }

  const inlineParen = trimmed.match(/^\\\(([\s\S]+)\\\)\s*[。．.，,;；:：!?？！]*$/u);
  if (inlineParen) {
    return inlineParen[1].replace(/\s+/g, "");
  }

  const inlineBracket = trimmed.match(/^\\\[([\s\S]+)\\\]\s*[。．.，,;；:：!?？！]*$/u);
  if (inlineBracket) {
    return inlineBracket[1].replace(/\s+/g, "");
  }

  return trimmed
    .replace(/[。．.，,;；:：!?？！]+$/u, "")
    .replace(/\s+/g, "");
}

function lineType(line: string): "heading" | "quote" | "ul" | "ol" | "plain" {
  if (/^\s*#{1,6}\s+/.test(line)) {
    return "heading";
  }
  if (/^\s*>\s?/.test(line)) {
    return "quote";
  }
  if (/^\s*[-*+]\s+/.test(line)) {
    return "ul";
  }
  if (/^\s*\d+\.\s+/.test(line)) {
    return "ol";
  }
  return "plain";
}

function detectLineLanguage(line: string): "zh" | "en" | "mixed" | "none" {
  if (isFormulaOnlyLine(line)) {
    return "none";
  }

  const text = normalizeLineForLanguage(line);
  const hasChinese = /[\u4e00-\u9fff]/.test(text);
  const hasEnglish = /[A-Za-z]/.test(text);

  if (hasChinese && !hasEnglish) {
    return "zh";
  }

  if (hasEnglish && !hasChinese) {
    return "en";
  }

  if (hasChinese && hasEnglish) {
    return "mixed";
  }

  return "none";
}

function shouldSwap(first: string, second: string): boolean {
  if (!first.trim() || !second.trim()) {
    return false;
  }

  if (lineType(first) !== lineType(second)) {
    return false;
  }

  return detectLineLanguage(first) === "en" && detectLineLanguage(second) === "zh";
}

function emphasizeChineseConcepts(line: string): string {
  const language = detectLineLanguage(line);
  if (language !== "zh" && language !== "mixed") {
    return line;
  }

  let result = line;

  for (const term of KEY_TERMS) {
    const pattern = new RegExp(`${escapeRegExp(term.zh)}(?![（(])`, "g");
    result = result.replace(pattern, `${term.zh}（${term.en}）`);
  }

  return result;
}

function isTableLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }

  if (trimmed.startsWith("|")) {
    return true;
  }

  return trimmed.includes("|") && /^[:\-\s|]+$/.test(trimmed);
}

function isStandalonePlainLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }

  if (lineType(trimmed) !== "plain") {
    return false;
  }

  if (isTableLine(trimmed) || /^[-*_]{3,}$/.test(trimmed) || /^<[^>]+>/.test(trimmed) || /^\$\$/.test(trimmed)) {
    return false;
  }

  return true;
}

function splitMixedPlainLine(line: string): string[] | null {
  if (lineType(line) !== "plain" || detectLineLanguage(line) !== "mixed") {
    return null;
  }

  const trimmed = line.trim();
  const match = trimmed.match(/^(.*[\u4e00-\u9fff].*?[。！？；.!?])\s+([A-Za-z][\s\S]*)$/);

  if (match) {
    const zh = match[1].trim();
    const en = match[2].trim();

    if (!zh || !en) {
      return null;
    }

    return [zh, en];
  }

  // Fallback: split by first substantial English phrase.
  const englishPhrase = trimmed.match(/[A-Za-z]{3,}(?:\s+[A-Za-z]{2,}){1,}/);
  if (!englishPhrase || englishPhrase.index === undefined) {
    return null;
  }

  const splitIndex = englishPhrase.index;
  const left = trimmed.slice(0, splitIndex).trim();
  const right = trimmed.slice(splitIndex).trim();

  if (!left || !right) {
    return null;
  }

  const leftLang = detectLineLanguage(left);
  const rightLang = detectLineLanguage(right);
  if (leftLang === "zh" && rightLang === "en") {
    return [left, right];
  }

  if (leftLang === "en" && rightLang === "zh") {
    return [right, left];
  }

  return null;
}

function splitMixedQuoteLine(line: string): string[] | null {
  if (lineType(line) !== "quote" || detectLineLanguage(line) !== "mixed") {
    return null;
  }

  const prefixMatch = line.match(/^(\s*>\s*)/);
  const prefix = prefixMatch?.[1] ?? "> ";
  const body = line.slice(prefix.length).trim();

  if (!body) {
    return null;
  }

  const englishPhrase = body.match(/[A-Za-z]{3,}(?:\s+[A-Za-z]{2,}){1,}/);
  if (!englishPhrase || englishPhrase.index === undefined) {
    return null;
  }

  const splitIndex = englishPhrase.index;
  const left = body.slice(0, splitIndex).trim();
  const right = body.slice(splitIndex).trim();

  if (!left || !right) {
    return null;
  }

  const leftLang = detectLineLanguage(left);
  const rightLang = detectLineLanguage(right);

  if (leftLang === "zh" && rightLang === "en") {
    return [`${prefix}${left}`, `${prefix}${right}`];
  }

  if (leftLang === "en" && rightLang === "zh") {
    return [`${prefix}${right}`, `${prefix}${left}`];
  }

  return null;
}

function pushParagraphLine(output: string[], line: string) {
  output.push(line);
  if (isStandalonePlainLine(line)) {
    output.push("");
  }
}

function pushQuoteParagraph(output: string[], line: string) {
  output.push(line);
  // Empty quote line forces paragraph separation inside the same quote block.
  output.push(">");
}

function preprocessBilingualMarkdown(source: string): string {
  const lines = source.split(/\r?\n/);
  const output: string[] = [];
  let inCodeFence = false;
  let inMathBlock = false;

  for (let i = 0; i < lines.length; i += 1) {
    const current = lines[i];
    const trimmedCurrent = current.trim();

    if (/^\s*```/.test(current)) {
      inCodeFence = !inCodeFence;
      output.push(current);
      continue;
    }

    if (!inCodeFence && /^\s*\$\$/.test(current)) {
      inMathBlock = !inMathBlock;
      output.push(current);
      continue;
    }

    if (inCodeFence) {
      output.push(current);
      continue;
    }

    if (inMathBlock) {
      output.push(current);
      continue;
    }

    const next = lines[i + 1];

    if (
      typeof next === "string" &&
      isFormulaOnlyLine(current) &&
      isFormulaOnlyLine(next) &&
      formulaSignature(current) &&
      formulaSignature(current) === formulaSignature(next)
    ) {
      output.push(current);
      output.push("");
      i += 1;
      continue;
    }

    if (typeof next === "string" && shouldSwap(current, next)) {
      const swappedZh = emphasizeChineseConcepts(next);
      const swappedEn = current;
      const swappedType = lineType(swappedZh);

      if (swappedType === "quote") {
        pushQuoteParagraph(output, swappedZh);
        pushQuoteParagraph(output, swappedEn);
      } else {
        pushParagraphLine(output, swappedZh);
        pushParagraphLine(output, swappedEn);
      }

      i += 1;
      continue;
    }

    const emphasized = emphasizeChineseConcepts(current);
    const splitMixedQuote = splitMixedQuoteLine(emphasized);
    if (splitMixedQuote) {
      pushQuoteParagraph(output, splitMixedQuote[0]);
      pushQuoteParagraph(output, splitMixedQuote[1]);
      continue;
    }

    const splitMixed = splitMixedPlainLine(emphasized);

    if (splitMixed) {
      pushParagraphLine(output, splitMixed[0]);
      pushParagraphLine(output, splitMixed[1]);
      continue;
    }

    output.push(emphasized);

    if (trimmedCurrent && isStandalonePlainLine(emphasized)) {
      output.push("");
    }
  }

  return output.join("\n");
}

type SectionListMode = "ul" | "ol" | null;

function normalizeSectionHeading(line: string): string {
  return line
    .replace(/^\s*#{1,6}\s+/, "")
    .trim()
    .toLowerCase();
}

function resolveSectionListMode(headingLine: string): SectionListMode {
  const heading = normalizeSectionHeading(headingLine);

  const unorderedSections = [
    "learning objectives",
    "key concepts",
    "error analysis",
    "common mistakes",
    "summary",
    "practice questions",
    "学习目标",
    "关键概念",
    "误差分析",
    "常见错误",
    "总结",
    "练习题",
  ];

  const orderedSections = ["derivations", "推导"];

  if (orderedSections.some((keyword) => heading.includes(keyword))) {
    return "ol";
  }

  if (unorderedSections.some((keyword) => heading.includes(keyword))) {
    return "ul";
  }

  return null;
}

function isListCandidatePlainLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }

  if (lineType(line) !== "plain") {
    return false;
  }

  if (isFormulaOnlyLine(line) || isTableLine(line)) {
    return false;
  }

  if (/^[-*_]{3,}$/.test(trimmed) || /^\s*<[^>]+>/.test(line) || /^\s*!\[[^\]]*\]\(/.test(line)) {
    return false;
  }

  return true;
}

function applySectionLists(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const output: string[] = [];
  let inCodeFence = false;
  let inMathBlock = false;
  let mode: SectionListMode = null;
  let orderIndex = 1;

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inCodeFence = !inCodeFence;
      output.push(line);
      continue;
    }

    if (!inCodeFence && /^\s*\$\$/.test(line)) {
      inMathBlock = !inMathBlock;
      output.push(line);
      continue;
    }

    if (inCodeFence || inMathBlock) {
      output.push(line);
      continue;
    }

    if (/^\s*#{2,6}\s+/.test(line)) {
      mode = resolveSectionListMode(line);
      orderIndex = 1;
      output.push(line);
      continue;
    }

    if (!line.trim()) {
      output.push(line);
      continue;
    }

    if (!mode || !isListCandidatePlainLine(line)) {
      output.push(line);
      continue;
    }

    const content = line.trim().replace(/^[-*+]\s+/, "").replace(/^\d+\.\s+/, "");

    if (mode === "ol") {
      output.push(`${orderIndex}. ${content}`);
      orderIndex += 1;
      continue;
    }

    output.push(`- ${content}`);
  }

  return output.join("\n");
}

export async function renderWeekContent(note: WeekNote) {
  const preparedSource = applySectionLists(preprocessBilingualMarkdown(note.source));

  return (
    <ReactMarkdown
      components={markdownComponents}
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[
        rehypeKatex,
        rehypeSlug,
        [
          rehypeAutolinkHeadings,
          {
            behavior: "append",
            properties: {
              className: ["anchor-link"],
              "aria-label": "Anchor",
            },
          },
        ],
      ]}
    >
      {preparedSource}
    </ReactMarkdown>
  );
}
