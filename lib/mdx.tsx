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
type PrepareNoteMarkdownOptions = {
  showEnglish?: boolean;
};

const MATH_FUNCTION_WORDS = new Set([
  "sin",
  "cos",
  "tan",
  "cot",
  "sec",
  "csc",
  "log",
  "ln",
  "exp",
  "lim",
  "max",
  "min",
]);

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

function extractMeaningfulEnglishWords(text: string): string[] {
  const words = (text.match(/\b[A-Za-z]{2,}(?:[-'][A-Za-z]{2,})?\b/g) ?? []).map((word) => word.toLowerCase());
  return words.filter((word) => !MATH_FUNCTION_WORDS.has(word));
}

function hasLikelyMathNotation(text: string): boolean {
  return /[=+\-*/^<>_{}\[\]\\\d\u0394\u03b4\u2211\u222b\u221a\u2248\u2264\u2265\u00b1]/.test(text);
}

function detectLineLanguageForChineseMode(line: string): LineLanguage {
  const text = stripForLanguageDetect(line);
  const hasChinese = /[\u4e00-\u9fff]/.test(text);
  const hasEnglish = /[A-Za-z]/.test(text);

  if (hasChinese && !hasEnglish) {
    return "zh";
  }

  if (hasEnglish && !hasChinese) {
    const normalizedText = text.replace(/\s+/g, " ").trim();
    const meaningfulWords = extractMeaningfulEnglishWords(normalizedText);
    const hasNaturalEnglishPhrase = /\b[A-Za-z]{2,}(?:[-'][A-Za-z]{2,})?[,:;)]?\s+[A-Za-z]{2,}\b/.test(normalizedText);
    const hasMathSignal = hasLikelyMathNotation(normalizedText);

    // Keep symbolic formula lines like FD[x], BD[x], etc.
    if (hasMathSignal && !hasNaturalEnglishPhrase && meaningfulWords.length <= 1) {
      return "mixed";
    }

    return meaningfulWords.length ? "en" : "mixed";
  }

  if (hasChinese && hasEnglish) {
    const normalizedText = text.replace(/\s+/g, " ").trim();
    const meaningfulWords = extractMeaningfulEnglishWords(normalizedText);
    const hasNaturalEnglishPhrase = /\b[A-Za-z]{2,}(?:[-'][A-Za-z]{2,})?[,:;)]?\s+[A-Za-z]{2,}\b/.test(normalizedText);
    const hasMathSignal = hasLikelyMathNotation(normalizedText);

    // Mixed line with only symbolic english tokens should stay as Chinese content.
    if (hasMathSignal && !hasNaturalEnglishPhrase && meaningfulWords.length <= 1) {
      return "zh";
    }

    return meaningfulWords.length ? "mixed" : "zh";
  }

  return "none";
}
function splitMarkdownPrefix(line: string): { prefix: string; content: string } {
  const match = line.match(/^(\s*(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+\.\s+)?)([\s\S]*)$/);
  if (!match) {
    return { prefix: "", content: line };
  }
  return { prefix: match[1], content: match[2] };
}

function stripInlineEnglishTranslation(content: string): string {
  let output = content;

  // Remove parenthesized english translation only, preserving markdown symbols around it.
  output = output.replace(/\s*[（(]\s*([A-Za-z][^()（）\n]{2,120})\s*[)）]/g, (full, enPart) => {
    return extractMeaningfulEnglishWords(enPart).length >= 2 ? "" : full;
  });

  output = output.replace(/\s+\/\s+([A-Za-z][^\/\n]{2,160})$/g, (full, enPart, offset, whole) => {
    const before = whole.slice(0, offset);
    if (/[\u4e00-\u9fff]/.test(before) && extractMeaningfulEnglishWords(enPart).length >= 2) {
      return "";
    }
    return full;
  });

  output = output.replace(/\s{2,}([A-Za-z][^\n]{2,180})$/g, (full, enPart, offset, whole) => {
    const before = whole.slice(0, offset);
    if (/[\u4e00-\u9fff]/.test(before) && extractMeaningfulEnglishWords(enPart).length >= 3) {
      return "";
    }
    return full;
  });

  return output.trimEnd();
}
function removeStandaloneEnglishLines(source: string): string {
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

    if (inCodeFence || inMathBlock || isTableLine(line)) {
      output.push(line);
      continue;
    }

    const language = detectLineLanguageForChineseMode(line);
    if (language === "en") {
      continue;
    }

    if (language === "mixed") {
      const { prefix, content } = splitMarkdownPrefix(line);
      const strippedContent = stripInlineEnglishTranslation(content);
      const rebuiltLine = `${prefix}${strippedContent}`.trimEnd();
      const rebuiltLanguage = detectLineLanguageForChineseMode(rebuiltLine);

      if (!rebuiltLine.trim() || rebuiltLanguage === "en") {
        continue;
      }

      output.push(rebuiltLine);
      continue;
    }

    output.push(line);
  }

  return output.join("\n").replace(/\n{3,}/g, "\n\n");
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

export function prepareNoteMarkdown(source: string, options: PrepareNoteMarkdownOptions = {}): string {
  const withNormalizedMath = normalizeMathDelimiters(source);
  const reordered = reorderBilingualLines(withNormalizedMath);
  const deduped = dedupeAdjacentLines(reordered);

  if (options.showEnglish === false) {
    return removeStandaloneEnglishLines(deduped);
  }

  return deduped;
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
