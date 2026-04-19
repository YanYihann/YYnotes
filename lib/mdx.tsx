import ReactMarkdown from "react-markdown";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { WeekNote } from "@/lib/content";
import allComponents from "@/components/mdx/mdx-components";

const markdownComponents = {
  h1: allComponents.h1,
  h2: allComponents.h2,
  h3: allComponents.h3,
  h4: allComponents.h4,
  p: allComponents.p,
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

type LineLanguage = "zh" | "en" | "mixed" | "none";
type LineKind = "heading" | "list" | "quote" | "plain" | "other";

function normalizeNewlines(source: string): string {
  return source.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function isCodeFenceLine(line: string): boolean {
  return /^\s*```/.test(line);
}

function isDisplayMathFenceLine(line: string): boolean {
  return /^\s*\$\$\s*$/.test(line);
}

function lineKind(line: string): LineKind {
  const trimmed = line.trim();
  if (!trimmed) {
    return "other";
  }

  if (/^#{1,6}\s+/.test(trimmed)) {
    return "heading";
  }

  if (/^>\s?/.test(trimmed)) {
    return "quote";
  }

  if (/^[-*+]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
    return "list";
  }

  if (trimmed.startsWith("|")) {
    return "other";
  }

  return "plain";
}

function stripForLanguageDetect(line: string): string {
  return line
    .trim()
    .replace(/^#{1,6}\s+/, "")
    .replace(/^>\s?/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .replace(/`[^`]*`/g, " ")
    .replace(/\$[^$]*\$/g, " ")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[[^\]]+]\([^)]+\)/g, " ")
    .replace(/<[^>]+>/g, " ")
    .trim();
}

function detectLineLanguage(line: string): LineLanguage {
  const text = stripForLanguageDetect(line);
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

function shouldSwapBilingualPair(first: string, second: string): boolean {
  if (!first.trim() || !second.trim()) {
    return false;
  }

  const firstKind = lineKind(first);
  const secondKind = lineKind(second);

  if (firstKind !== secondKind || firstKind === "other") {
    return false;
  }

  return detectLineLanguage(first) === "en" && detectLineLanguage(second) === "zh";
}

function normalizeMathDelimiters(source: string): string {
  let output = normalizeNewlines(source);

  output = output.replace(/```(?:math|latex|tex)\s*\n([\s\S]*?)\n```/gi, (_match, body: string) => {
    const normalized = body.trim();
    if (!normalized) {
      return "";
    }
    return `$$\n${normalized}\n$$`;
  });

  output = output.replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_match, body: string) => {
    const normalized = body.trim();
    if (!normalized) {
      return "";
    }
    return `$$\n${normalized}\n$$`;
  });

  output = output.replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, (_match, body: string) => {
    const normalized = body.trim();
    if (!normalized) {
      return "";
    }
    return `$${normalized}$`;
  });

  return output;
}

function reorderBilingualLines(source: string): string {
  const lines = source.split("\n");
  const output: string[] = [];
  let inCodeFence = false;
  let inMathBlock = false;

  for (let index = 0; index < lines.length; index += 1) {
    const current = lines[index];

    if (isCodeFenceLine(current)) {
      inCodeFence = !inCodeFence;
      output.push(current);
      continue;
    }

    if (!inCodeFence && isDisplayMathFenceLine(current)) {
      inMathBlock = !inMathBlock;
      output.push(current);
      continue;
    }

    if (inCodeFence || inMathBlock) {
      output.push(current);
      continue;
    }

    const next = lines[index + 1];
    if (typeof next === "string" && shouldSwapBilingualPair(current, next)) {
      output.push(next);
      output.push(current);
      index += 1;
      continue;
    }

    output.push(current);
  }

  return output.join("\n");
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

function isMathOnlyLine(line: string): boolean {
  const normalized = line
    .trim()
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .trim();

  if (!normalized) {
    return false;
  }

  if (/^\$\$[\s\S]*\$\$$/.test(normalized)) {
    return true;
  }

  if (/^\$[^$]+\$$/.test(normalized)) {
    return true;
  }

  if (/^\\\[[\s\S]*\\\]$/.test(normalized) || /^\\\([\s\S]*\\\)$/.test(normalized)) {
    return true;
  }

  return false;
}

function mathSignature(line: string): string {
  const normalized = line
    .trim()
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .trim();

  const display = normalized.match(/^\$\$([\s\S]*)\$\$$/);
  if (display) {
    return display[1].replace(/\s+/g, "");
  }

  const inline = normalized.match(/^\$([\s\S]*)\$$/);
  if (inline) {
    return inline[1].replace(/\s+/g, "");
  }

  return normalized.replace(/\s+/g, "");
}

function dedupeAdjacentLines(source: string): string {
  const lines = source.split("\n");
  const output: string[] = [];
  let inCodeFence = false;
  let inMathBlock = false;

  for (const line of lines) {
    if (isCodeFenceLine(line)) {
      inCodeFence = !inCodeFence;
      output.push(line);
      continue;
    }

    if (!inCodeFence && isDisplayMathFenceLine(line)) {
      inMathBlock = !inMathBlock;
      output.push(line);
      continue;
    }

    if (inCodeFence || inMathBlock) {
      output.push(line);
      continue;
    }

    const previous = output[output.length - 1] ?? "";
    const previousNonEmpty = [...output].reverse().find((item) => item.trim());
    const trimmed = line.trim();
    const previousTrimmed = previous.trim();

    if (trimmed && previousTrimmed) {
      const exactDuplicate =
        trimmed === previousTrimmed &&
        lineKind(line) !== "other" &&
        lineKind(previous) !== "other" &&
        !isTableLine(line);

      const mathDuplicate =
        isMathOnlyLine(line) && isMathOnlyLine(previous) && mathSignature(line) && mathSignature(line) === mathSignature(previous);

      if (exactDuplicate || mathDuplicate) {
        continue;
      }
    }

    if (trimmed && previousNonEmpty && isMathOnlyLine(line) && isMathOnlyLine(previousNonEmpty)) {
      if (mathSignature(line) && mathSignature(line) === mathSignature(previousNonEmpty)) {
        continue;
      }
    }

    output.push(line);
  }

  return output.join("\n");
}

export function prepareNoteMarkdown(source: string): string {
  const withNormalizedMath = normalizeMathDelimiters(source);
  const reordered = reorderBilingualLines(withNormalizedMath);
  return dedupeAdjacentLines(reordered);
}

export async function renderWeekContent(note: WeekNote) {
  const preparedSource = prepareNoteMarkdown(note.source);

  return (
    <ReactMarkdown
      components={markdownComponents}
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[
        rehypeRaw,
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
