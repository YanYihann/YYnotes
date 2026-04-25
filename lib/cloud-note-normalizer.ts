import GithubSlugger from "github-slugger";
import type { Heading } from "@/lib/content";
import { splitBilingualNoteSections } from "@/lib/bilingual-note";

const DEFAULT_DESCRIPTION_EN = "Bilingual study notes.";
const DEFAULT_DESCRIPTION_ZH = "\u53cc\u8bed\u5b66\u4e60\u7b14\u8bb0\u3002";

export type CloudNoteRecord = {
  slug?: unknown;
  title?: unknown;
  topic?: unknown;
  topic_zh?: unknown;
  topic_en?: unknown;
  folder_id?: unknown;
  tags?: unknown;
  mdx_content?: unknown;
  created_at?: unknown;
};

type FrontmatterData = {
  title?: string;
  enTitle?: string;
  zhTitle?: string;
  description?: string;
  descriptionEn?: string;
  descriptionZh?: string;
  topic?: string;
  topicEn?: string;
  topicZh?: string;
  tags?: string[] | string;
  week?: string;
  order?: string;
};

export type NormalizedCloudNote = {
  slug: string;
  zhTitle: string;
  enTitle: string;
  descriptionZh: string;
  descriptionEn: string;
  topicZh: string;
  topicEn: string;
  tags: string[];
  noteContent: string;
  headings: Heading[];
  order: number;
  createdAtMs: number;
};

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function parseScalar(raw: string): string {
  const value = raw.trim();
  const quoted =
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"));
  return quoted ? value.slice(1, -1).trim() : value;
}

function parseFrontmatterAndBody(content: string): { body: string; data: FrontmatterData } {
  const source = normalizeNewlines(content).trim();
  if (!source.startsWith("---\n")) {
    return { body: source, data: {} };
  }

  const end = source.indexOf("\n---\n", 4);
  if (end === -1) {
    return { body: source, data: {} };
  }

  const frontmatterBlock = source.slice(4, end);
  const body = source.slice(end + 5).trim();
  const lines = frontmatterBlock.split("\n");

  const data: Record<string, unknown> = {};
  let currentArrayKey = "";

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const itemMatch = trimmed.match(/^- (.+)$/);
    if (itemMatch && currentArrayKey) {
      const current = data[currentArrayKey];
      if (Array.isArray(current)) {
        current.push(parseScalar(itemMatch[1]));
      } else {
        data[currentArrayKey] = [parseScalar(itemMatch[1])];
      }
      continue;
    }

    const kvMatch = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kvMatch) {
      continue;
    }

    const key = kvMatch[1];
    const rawValue = kvMatch[2].trim();

    if (!rawValue) {
      data[key] = [];
      currentArrayKey = key;
      continue;
    }

    currentArrayKey = "";

    if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      const items = rawValue
        .slice(1, -1)
        .split(/[\uFF0C,]/)
        .map((item) => parseScalar(item))
        .filter(Boolean);
      data[key] = items;
      continue;
    }

    data[key] = parseScalar(rawValue);
  }

  return {
    body,
    data: data as FrontmatterData,
  };
}

function normalizeFrontmatterText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[\uFF0C,\u3001|]/)
      .map((item) => item.trim().replace(/^#+/, ""))
      .filter(Boolean);
  }

  return [];
}

function stripLeadingTopHeadings(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();

    if (!line) {
      index += 1;
      continue;
    }

    if (/^#\s+/.test(line)) {
      index += 1;
      continue;
    }

    break;
  }

  return lines.slice(index).join("\n").trimStart();
}

function normalizeHeadingText(rawTitle: string): string {
  return rawTitle
    .trim()
    .replace(/`/g, "")
    .replace(/\$([^$]+)\$/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .trim();
}

function detectLanguage(text: string): "zh" | "en" | "mixed" {
  const hasChinese = /[\u4e00-\u9fff]/.test(text);
  const hasEnglish = /[A-Za-z]/.test(text);

  if (hasChinese && !hasEnglish) {
    return "zh";
  }

  if (hasEnglish && !hasChinese) {
    return "en";
  }

  return "mixed";
}

function extractTopLevelBilingualTitles(markdown: string): { enTitle?: string; zhTitle?: string } {
  const lines = markdown.split(/\r?\n/);
  let enTitle: string | undefined;
  let zhTitle: string | undefined;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      if (enTitle || zhTitle) {
        break;
      }
      continue;
    }

    const headingMatch = line.match(/^#\s+(.+)$/);
    if (!headingMatch) {
      if (enTitle || zhTitle) {
        break;
      }
      continue;
    }

    const title = normalizeHeadingText(headingMatch[1]);
    if (!title) {
      continue;
    }

    const lang = detectLanguage(title);

    if (!enTitle && (lang === "en" || lang === "mixed")) {
      enTitle = title;
      continue;
    }

    if (!zhTitle && (lang === "zh" || lang === "mixed")) {
      zhTitle = title;
      continue;
    }
  }

  return { enTitle, zhTitle };
}

function extractFirstParagraph(markdown: string): string {
  const lines = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#") && !line.startsWith(">") && !line.startsWith("```"));

  return lines[0] ?? DEFAULT_DESCRIPTION_EN;
}

function normalizeDescriptionLine(line: string): string {
  return line
    .trim()
    .replace(/^#{1,6}\s+/, "")
    .replace(/^>\s?/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\$([^$]+)\$/g, "$1")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .trim();
}

function splitMixedDescriptionLine(line: string): { zh: string; en: string } | null {
  const sentenceSplit = line.match(/^(.*[\u4e00-\u9fff].*?[\u3002\uFF01\uFF1F!?])\s+([A-Za-z][\s\S]*)$/u);
  if (sentenceSplit) {
    return {
      zh: sentenceSplit[1].trim(),
      en: sentenceSplit[2].trim(),
    };
  }

  const englishPhrase = line.match(/[A-Za-z]{3,}(?:\s+[A-Za-z]{2,}){1,}/);
  if (!englishPhrase || englishPhrase.index === undefined) {
    return null;
  }

  const left = line.slice(0, englishPhrase.index).trim();
  const right = line.slice(englishPhrase.index).trim();
  const leftLang = detectLanguage(left);
  const rightLang = detectLanguage(right);

  if (left && right && leftLang === "zh" && rightLang === "en") {
    return { zh: left, en: right };
  }

  if (left && right && leftLang === "en" && rightLang === "zh") {
    return { zh: right, en: left };
  }

  return null;
}

function extractBilingualDescription(markdown: string): { descriptionEn?: string; descriptionZh?: string } {
  const lines = markdown.split(/\r?\n/);
  let descriptionEn: string | undefined;
  let descriptionZh: string | undefined;
  let scannedMeaningfulLines = 0;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      continue;
    }

    if (/^(#{1,6}\s|>\s|```|\$\$)/.test(trimmed)) {
      continue;
    }

    const normalized = normalizeDescriptionLine(trimmed);
    if (!normalized) {
      continue;
    }

    scannedMeaningfulLines += 1;
    const language = detectLanguage(normalized);

    if (language === "en" && !descriptionEn) {
      descriptionEn = normalized;
    } else if (language === "zh" && !descriptionZh) {
      descriptionZh = normalized;
    } else if (language === "mixed") {
      const split = splitMixedDescriptionLine(normalized);
      if (split) {
        if (!descriptionZh) {
          descriptionZh = split.zh;
        }
        if (!descriptionEn) {
          descriptionEn = split.en;
        }
      }
    }

    if (descriptionEn && descriptionZh) {
      break;
    }

    if (scannedMeaningfulLines >= 20) {
      break;
    }
  }

  return { descriptionEn, descriptionZh };
}

function extractHeadings(markdown: string): Heading[] {
  const slugger = new GithubSlugger();
  slugger.reset();

  const parsed: Array<{ id: string; title: string; level: 2 | 3; lang: "zh" | "en" | "mixed" }> = [];
  const matches = markdown.matchAll(/^(#{2,3})\s+(.+)$/gm);

  for (const match of matches) {
    const level = match[1].length as 2 | 3;
    const title = normalizeHeadingText(match[2]);

    if (!title) {
      continue;
    }

    const id = slugger.slug(title);
    if (!id) {
      continue;
    }

    parsed.push({
      id,
      title,
      level,
      lang: detectLanguage(title),
    });
  }

  const headings: Heading[] = [];

  for (let index = 0; index < parsed.length; index += 1) {
    const current = parsed[index];
    const next = parsed[index + 1];

    if (current.lang === "en" && next && next.lang === "zh" && next.level === current.level) {
      headings.push({
        id: next.id,
        title: next.title,
        enTitle: current.title,
        level: next.level,
      });
      index += 1;
      continue;
    }

    headings.push({
      id: current.id,
      title: current.title,
      level: current.level,
      enTitle: current.lang === "zh" && next && next.lang === "en" && next.level === current.level ? next.title : undefined,
    });

    if (current.lang === "zh" && next && next.lang === "en" && next.level === current.level) {
      index += 1;
    }
  }

  return headings;
}

function parseNumberOrUndefined(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) {
      return undefined;
    }

    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function parseCreatedAtMs(value: unknown): number {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeCloudNote(note: CloudNoteRecord | null): NormalizedCloudNote {
  if (!note) {
    return {
      slug: "",
      zhTitle: "\u4e91\u7aef\u7b14\u8bb0",
      enTitle: "Cloud Note",
      descriptionZh: DEFAULT_DESCRIPTION_ZH,
      descriptionEn: DEFAULT_DESCRIPTION_EN,
      topicZh: "\u672a\u5206\u7c7b",
      topicEn: "General",
      tags: [],
      noteContent: "",
      headings: [],
      order: 0,
      createdAtMs: 0,
    };
  }

  const { body, data } = parseFrontmatterAndBody(String(note.mdx_content ?? ""));
  const strippedSource = stripLeadingTopHeadings(body);
  const source = strippedSource || body.trimStart();
  const sections = splitBilingualNoteSections(source);
  const headingsSource = sections.hasStructuredSections ? sections.zhBody : source;
  const headings = extractHeadings(headingsSource);
  const topTitles = extractTopLevelBilingualTitles(body);

  const slug = String(note.slug ?? "").trim();
  const slugName = slug.replace(/[-_]+/g, " ").trim() || "note";

  const weekNumberRaw = parseNumberOrUndefined(data.week);
  const weekNumber = weekNumberRaw && weekNumberRaw > 0 ? weekNumberRaw : 0;
  const orderRaw = parseNumberOrUndefined(data.order);
  const createdAtMs = parseCreatedAtMs(note.created_at);
  const order = Number.isFinite(orderRaw ?? NaN) ? (orderRaw as number) : weekNumber > 0 ? weekNumber : Math.floor(createdAtMs);

  const rowTitle = normalizeFrontmatterText(note.title);
  const rowTitleLang = rowTitle ? detectLanguage(rowTitle) : "none";
  const frontmatterTitle =
    normalizeFrontmatterText(data.title) ??
    normalizeFrontmatterText(data.zhTitle) ??
    normalizeFrontmatterText(data.enTitle);
  const frontmatterTitleLang = frontmatterTitle ? detectLanguage(frontmatterTitle) : "none";

  const enTitle =
    normalizeFrontmatterText(data.enTitle) ??
    (rowTitle && rowTitleLang !== "zh" ? rowTitle : undefined) ??
    (frontmatterTitle && frontmatterTitleLang !== "zh" ? frontmatterTitle : undefined) ??
    topTitles.enTitle ??
    `Note ${slugName}`;

  const zhTitle =
    normalizeFrontmatterText(data.zhTitle) ??
    (rowTitle && rowTitleLang !== "en" ? rowTitle : undefined) ??
    (frontmatterTitle && frontmatterTitleLang === "zh" ? frontmatterTitle : undefined) ??
    topTitles.zhTitle ??
    slugName;

  const parsedDescriptions = extractBilingualDescription(source);
  const sectionZhDescription = sections.hasStructuredSections ? extractFirstParagraph(sections.zhBody) : undefined;
  const sectionEnDescription = sections.hasStructuredSections ? extractFirstParagraph(sections.enBody) : undefined;
  const frontmatterDescription = normalizeFrontmatterText(data.description);
  const frontmatterDescriptionLang = frontmatterDescription ? detectLanguage(frontmatterDescription) : "none";

  const descriptionEnCandidate =
    normalizeFrontmatterText(data.descriptionEn) ??
    (frontmatterDescriptionLang !== "zh" ? frontmatterDescription : undefined) ??
    parsedDescriptions.descriptionEn ??
    (sectionEnDescription && detectLanguage(sectionEnDescription) !== "zh" ? sectionEnDescription : undefined) ??
    extractFirstParagraph(source);
  const descriptionEn =
    descriptionEnCandidate && detectLanguage(descriptionEnCandidate) !== "zh" ? descriptionEnCandidate : DEFAULT_DESCRIPTION_EN;

  const descriptionZh =
    normalizeFrontmatterText(data.descriptionZh) ??
    (frontmatterDescriptionLang === "zh" ? frontmatterDescription : undefined) ??
    parsedDescriptions.descriptionZh ??
    (sectionZhDescription && detectLanguage(sectionZhDescription) !== "en" ? sectionZhDescription : undefined) ??
    DEFAULT_DESCRIPTION_ZH;

  let topicZh = normalizeFrontmatterText(note.topic_zh) ?? normalizeFrontmatterText(data.topicZh);
  let topicEn = normalizeFrontmatterText(note.topic_en) ?? normalizeFrontmatterText(data.topicEn);
  const topicRaw = normalizeFrontmatterText(note.topic) ?? normalizeFrontmatterText(data.topic);

  if (topicRaw) {
    const lang = detectLanguage(topicRaw);
    if (!topicZh && lang !== "en") {
      topicZh = topicRaw;
    }
    if (!topicEn && lang !== "zh") {
      topicEn = topicRaw;
    }
  }

  if (!topicZh) {
    topicZh = headings[0]?.title ?? (weekNumber > 0 ? `\u7b2c${weekNumber}\u5468` : "\u672a\u5206\u7c7b");
  }

  if (!topicEn) {
    topicEn = headings.find((heading) => heading.enTitle)?.enTitle ?? (weekNumber > 0 ? `Week ${weekNumber}` : enTitle);
  }

  const tagsFromFrontmatter = normalizeTags(data.tags);
  const tagsFromRecord = normalizeTags(note.tags);
  const derivedTags = headings
    .map((heading) => heading.title)
    .filter(Boolean)
    .slice(0, 4);
  const tags = tagsFromRecord.length ? tagsFromRecord : tagsFromFrontmatter.length ? tagsFromFrontmatter : derivedTags;

  return {
    slug,
    zhTitle,
    enTitle,
    descriptionZh,
    descriptionEn,
    topicZh,
    topicEn,
    tags,
    noteContent: source,
    headings,
    order,
    createdAtMs,
  };
}

export function normalizeCloudNoteRows(rows: unknown): NormalizedCloudNote[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map((row) => normalizeCloudNote(row as CloudNoteRecord))
    .filter((row) => row.slug);
}

export function resolveAdjacentByOrder(
  slug: string,
  rows: NormalizedCloudNote[],
): {
  previousSlug?: string;
  nextSlug?: string;
} {
  if (!slug || rows.length < 2) {
    return {};
  }

  const sorted = [...rows].sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
  const index = sorted.findIndex((item) => item.slug === slug);

  if (index === -1) {
    return {};
  }

  return {
    previousSlug: sorted[index - 1]?.slug,
    nextSlug: sorted[index + 1]?.slug,
  };
}
