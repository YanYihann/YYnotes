import ReactMarkdown from "react-markdown";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import remarkBreaks from "remark-breaks";
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
  div: allComponents.div,
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

function isHeadingLine(line: string): boolean {
  return /^#{1,6}\s+/.test(line.trim());
}

function isListItemLine(line: string): boolean {
  return /^\s*(?:[-*+]\s+|\d+\.\s+)/.test(line);
}

function splitBodyIntoDisplayUnits(source: string): string[] {
  const lines = normalizeNewlines(source).split("\n");
  const units: string[] = [];
  let current: string[] = [];
  let inCodeFence = false;
  let inDisplayMathFence = false;

  const flush = () => {
    const block = current.join("\n").trim();
    if (block) {
      units.push(block);
    }
    current = [];
  };

  for (const line of lines) {
    if (isCodeFenceLine(line)) {
      inCodeFence = !inCodeFence;
      current.push(line);
      continue;
    }

    if (!inCodeFence && isDisplayMathFenceLine(line)) {
      inDisplayMathFence = !inDisplayMathFence;
      current.push(line);
      continue;
    }

    if (inCodeFence || inDisplayMathFence) {
      current.push(line);
      continue;
    }

    const trimmed = line.trim();

    if (!trimmed) {
      flush();
      continue;
    }

    if (isHeadingLine(line)) {
      flush();
      units.push(trimmed);
      continue;
    }

    if (isListItemLine(line) && current.length > 0) {
      flush();
    }

    current.push(line);
  }

  flush();
  return units;
}

function interleaveBilingualBodies(zhBody: string, enBody: string): string {
  const zhUnits = splitBodyIntoDisplayUnits(zhBody);
  const enUnits = splitBodyIntoDisplayUnits(enBody);

  if (!zhUnits.length && !enUnits.length) {
    return "";
  }

  if (!enUnits.length) {
    return zhBody;
  }

  if (!zhUnits.length) {
    return enBody;
  }

  const output: string[] = [];
  const maxLength = Math.max(zhUnits.length, enUnits.length);

  for (let index = 0; index < maxLength; index += 1) {
    const zhUnit = zhUnits[index];
    const enUnit = enUnits[index];

    if (zhUnit) {
      output.push(zhUnit);
    }
    if (enUnit) {
      output.push(enUnit);
    }
  }

  return output.join("\n\n").trim();
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

function normalizeMixedContentDisplayMath(source: string): string {
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

    const fenceCount = (line.match(/\$\$/g) ?? []).length;
    const isWholeSingleDisplayExpr = /^\s*\$\$[\s\S]*\$\$\s*$/.test(line.trim());
    const isMixedContentLine = fenceCount >= 2 && fenceCount % 2 === 0 && !isWholeSingleDisplayExpr;

    if (!isMixedContentLine) {
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
        pendingText += line.slice(cursor);
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

  return interleaveBilingualBodies(sections.zhBody, sections.enBody);
}

export function prepareNoteMarkdown(source: string, options: PrepareNoteMarkdownOptions = {}): string {
  const normalized = normalizeMathDelimiters(normalizeNewlines(source).trim());
  const rendered = composeRenderedSource(normalized, options.showEnglish !== false);
  const fixedMixedDisplayMath = normalizeMixedContentDisplayMath(rendered);
  return dedupeAdjacentLines(fixedMixedDisplayMath).trim();
}

export async function renderWeekContent(note: WeekNote) {
  const preparedSource = prepareNoteMarkdown(note.source);

  return (
    <ReactMarkdown
      components={markdownComponents}
    remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
      rehypePlugins={[
        rehypeRaw,
        [rehypeHighlight, { detect: true, ignoreMissing: true }],
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
