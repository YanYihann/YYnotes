import ReactMarkdown from "react-markdown";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { WeekNote } from "@/lib/content";
import { splitBilingualNoteSections } from "@/lib/bilingual-note";
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

type PrepareNoteMarkdownOptions = {
  showEnglish?: boolean;
};

function normalizeNewlines(source: string): string {
  return source.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function isCodeFenceLine(line: string): boolean {
  return /^\s*```/.test(line);
}

function isDisplayMathFenceLine(line: string): boolean {
  return /^\s*\$\$\s*$/.test(line);
}

function hasInlineDisplayMath(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("$$")) {
    return false;
  }

  // If the whole line is only a display fence or a single display expression,
  // keep it unchanged.
  if (isDisplayMathFenceLine(trimmed) || /^\s*\$\$[\s\S]*\$\$\s*$/.test(trimmed)) {
    return false;
  }

  return true;
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

function explodeDisplayMathFences(source: string): string {
  const lines = source.split("\n");
  const output: string[] = [];
  let inCodeFence = false;

  for (const line of lines) {
    if (isCodeFenceLine(line)) {
      inCodeFence = !inCodeFence;
      output.push(line);
      continue;
    }

    if (inCodeFence || !line.includes("$$")) {
      output.push(line);
      continue;
    }

    // Force every display-math fence marker to become a standalone line so
    // markdown headings/list text cannot leak into math mode.
    const rewritten = line.replace(/\$\$/g, "\n$$\n");
    output.push(...rewritten.split("\n"));
  }

  return output.join("\n");
}

function splitInlineDisplayMathLines(source: string): string {
  const lines = source.split("\n");
  const output: string[] = [];
  let inCodeFence = false;

  for (const line of lines) {
    if (isCodeFenceLine(line)) {
      inCodeFence = !inCodeFence;
      output.push(line);
      continue;
    }

    if (inCodeFence || !hasInlineDisplayMath(line)) {
      output.push(line);
      continue;
    }

    let cursor = 0;
    let pendingText = "";

    while (cursor < line.length) {
      const start = line.indexOf("$$", cursor);
      if (start < 0) {
        pendingText += line.slice(cursor);
        break;
      }

      const end = line.indexOf("$$", start + 2);
      if (end < 0) {
        // Unmatched $$ in a mixed-content line: degrade it to inline math marker.
        pendingText += line.slice(cursor, start) + "$" + line.slice(start + 2);
        break;
      }

      pendingText += line.slice(cursor, start);
      if (pendingText.trim()) {
        output.push(pendingText.trimEnd());
      }

      const body = line.slice(start + 2, end).trim();
      if (body) {
        output.push("$$");
        output.push(body);
        output.push("$$");
      }

      pendingText = "";
      cursor = end + 2;
    }

    if (pendingText.trim()) {
      output.push(pendingText.trimEnd());
    }
  }

  return output.join("\n");
}

function balanceStandaloneDisplayMathFences(source: string): string {
  const lines = source.split("\n");
  let inCodeFence = false;
  const fenceLineIndexes: number[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (isCodeFenceLine(line)) {
      inCodeFence = !inCodeFence;
      continue;
    }

    if (inCodeFence) {
      continue;
    }

    if (isDisplayMathFenceLine(line)) {
      fenceLineIndexes.push(index);
    }
  }

  // If unmatched, convert the last fence back to a plain "$" line to avoid
  // keeping the document in math mode and breaking later inline formulas.
  if (fenceLineIndexes.length % 2 === 1) {
    const lastFenceIndex = fenceLineIndexes[fenceLineIndexes.length - 1];
    lines[lastFenceIndex] = "$";
  }

  return lines.join("\n");
}

function findInlineDollarIndexes(line: string): number[] {
  const indexes: number[] = [];

  for (let i = 0; i < line.length; i += 1) {
    if (line[i] !== "$") {
      continue;
    }

    const prev = i > 0 ? line[i - 1] : "";
    const next = i + 1 < line.length ? line[i + 1] : "";

    if (prev === "\\" || next === "$") {
      continue;
    }

    indexes.push(i);
  }

  return indexes;
}

function escapeUnbalancedInlineDollar(source: string): string {
  const lines = source.split("\n");
  const output: string[] = [];
  let inCodeFence = false;
  let inDisplayMathBlock = false;

  for (const line of lines) {
    if (isCodeFenceLine(line)) {
      inCodeFence = !inCodeFence;
      output.push(line);
      continue;
    }

    if (!inCodeFence && isDisplayMathFenceLine(line)) {
      inDisplayMathBlock = !inDisplayMathBlock;
      output.push(line);
      continue;
    }

    if (inCodeFence || inDisplayMathBlock) {
      output.push(line);
      continue;
    }

    const indexes = findInlineDollarIndexes(line);
    if (indexes.length % 2 === 0) {
      output.push(line);
      continue;
    }

    const lastIndex = indexes[indexes.length - 1];
    output.push(`${line.slice(0, lastIndex)}\\${line.slice(lastIndex)}`);
  }

  return output.join("\n");
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
      const exactDuplicate = trimmed === previousTrimmed && !isTableLine(line) && !isTableLine(previous);
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

function composeRenderedSource(source: string, showEnglish: boolean): string {
  const sections = splitBilingualNoteSections(source);
  if (!sections.hasStructuredSections) {
    return source;
  }

  if (!showEnglish) {
    return sections.zhBody;
  }

  return [sections.zhBody, "---", "## English Version", sections.enBody].join("\n\n");
}

export function prepareNoteMarkdown(source: string, options: PrepareNoteMarkdownOptions = {}): string {
  const normalized = normalizeMathDelimiters(normalizeNewlines(source).trim());
  const rendered = composeRenderedSource(normalized, options.showEnglish !== false);
  const exploded = explodeDisplayMathFences(rendered);
  const splitDisplay = splitInlineDisplayMathLines(exploded);
  const balanced = balanceStandaloneDisplayMathFences(splitDisplay);
  const escapedInline = escapeUnbalancedInlineDollar(balanced);
  return dedupeAdjacentLines(escapedInline).trim();
}

export async function renderWeekContent(note: WeekNote) {
  const preparedSource = prepareNoteMarkdown(note.source);

  return (
    <ReactMarkdown
      components={markdownComponents}
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[
        rehypeRaw,
        [rehypeKatex, { throwOnError: false, strict: "ignore" }],
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
