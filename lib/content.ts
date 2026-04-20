import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import GithubSlugger from "github-slugger";
import { splitBilingualNoteSections } from "@/lib/bilingual-note";

export type Heading = {
  id: string;
  title: string;
  enTitle?: string;
  level: 2 | 3;
};

export type WeekNote = {
  slug: string;
  title: string;
  enTitle: string;
  zhTitle: string;
  description: string;
  descriptionEn: string;
  descriptionZh: string;
  weekNumber: number;
  weekLabel: string;
  weekLabelEn: string;
  weekLabelZh: string;
  topic: string;
  topicEn: string;
  topicZh: string;
  tags: string[];
  order: number;
  source: string;
  headings: Heading[];
  filePath: string;
};

type Frontmatter = {
  title?: string;
  description?: string;
  descriptionEn?: string;
  descriptionZh?: string;
  slug?: string;
  week?: number;
  order?: number;
  topic?: string;
  topicEn?: string;
  topicZh?: string;
  tags?: string[] | string;
};

const WEEK_FILE_PATTERN = /^week(\d+)\.mdx$/i;
const NOTE_FILE_PATTERN = /\.mdx$/i;
const CONTENT_DIRS = ["\u7B14\u8BB0"];
const DEFAULT_DESCRIPTION_EN = "Bilingual study notes.";
const DEFAULT_DESCRIPTION_ZH = "\u53CC\u8BED\u5B66\u4E60\u7B14\u8BB0\u3002";

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

function splitMixedDescriptionLine(
  line: string,
): {
  zh: string;
  en: string;
} | null {
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

function extractBilingualDescription(markdown: string): {
  descriptionEn?: string;
  descriptionZh?: string;
} {
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

function normalizeFrontmatterText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function slugifyText(input: string): string {
  const base = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (base) {
    return base;
  }

  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `note-${stamp}`;
}

function parseFrontmatterTags(value: Frontmatter["tags"]): string[] {
  const rawList = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\uFF0C,\u3001|]/) : [];

  const deduped = new Set<string>();
  for (const raw of rawList) {
    const tag = String(raw).trim().replace(/^#+/, "");
    if (!tag) {
      continue;
    }
    deduped.add(tag);
    if (deduped.size >= 12) {
      break;
    }
  }

  return Array.from(deduped);
}

async function findNoteFiles(): Promise<string[]> {
  const root = process.cwd();
  const found = new Set<string>();

  for (const relativeDir of CONTENT_DIRS) {
    const absoluteDir = path.join(root, relativeDir);

    try {
      const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !NOTE_FILE_PATTERN.test(entry.name)) {
          continue;
        }

        found.add(path.join(absoluteDir, entry.name));
      }
    } catch {
      // Directory is optional by design.
    }
  }

  return Array.from(found);
}

async function readNoteFromFile(filePath: string): Promise<WeekNote | null> {
  const fileName = path.basename(filePath);
  const weekMatch = fileName.match(WEEK_FILE_PATTERN);

  const raw = await fs.readFile(filePath, "utf8");
  const parsed = matter(raw);
  const frontmatter = parsed.data as Frontmatter;
  const topTitles = extractTopLevelBilingualTitles(parsed.content);
  const source = stripLeadingTopHeadings(parsed.content);
  const sections = splitBilingualNoteSections(source);
  const headingsSource = sections.hasStructuredSections ? sections.zhBody : source;
  const headings = extractHeadings(headingsSource);
  const stat = await fs.stat(filePath);

  const weekFromName = weekMatch ? Number(weekMatch[1]) : undefined;
  const weekNumber = frontmatter.week ?? weekFromName ?? 0;
  const frontmatterTitle = normalizeFrontmatterText(frontmatter.title);
  const frontmatterTitleLang = frontmatterTitle ? detectLanguage(frontmatterTitle) : "none";

  const enTitle =
    frontmatterTitle && frontmatterTitleLang !== "zh"
      ? frontmatterTitle
      : topTitles.enTitle ?? `Note ${path.parse(fileName).name}`;
  const zhTitle =
    frontmatterTitle && frontmatterTitleLang === "zh"
      ? frontmatterTitle
      : topTitles.zhTitle ?? `笔记：${path.parse(fileName).name}`;

  const parsedDescriptions = extractBilingualDescription(source);
  const sectionZhDescription = sections.hasStructuredSections ? extractFirstParagraph(sections.zhBody) : undefined;
  const sectionEnDescription = sections.hasStructuredSections ? extractFirstParagraph(sections.enBody) : undefined;
  const frontmatterDescription = normalizeFrontmatterText(frontmatter.description);
  const frontmatterDescriptionLang = frontmatterDescription ? detectLanguage(frontmatterDescription) : "none";

  const descriptionEnCandidate =
    normalizeFrontmatterText(frontmatter.descriptionEn) ??
    (frontmatterDescriptionLang !== "zh" ? frontmatterDescription : undefined) ??
    parsedDescriptions.descriptionEn ??
    (sectionEnDescription && detectLanguage(sectionEnDescription) !== "zh" ? sectionEnDescription : undefined) ??
    extractFirstParagraph(source);
  const descriptionEn =
    descriptionEnCandidate && detectLanguage(descriptionEnCandidate) !== "zh" ? descriptionEnCandidate : DEFAULT_DESCRIPTION_EN;

  const descriptionZh =
    normalizeFrontmatterText(frontmatter.descriptionZh) ??
    (frontmatterDescriptionLang === "zh" ? frontmatterDescription : undefined) ??
    parsedDescriptions.descriptionZh ??
    (sectionZhDescription && detectLanguage(sectionZhDescription) !== "en" ? sectionZhDescription : undefined) ??
    DEFAULT_DESCRIPTION_ZH;

  let topicZh = normalizeFrontmatterText(frontmatter.topicZh);
  let topicEn = normalizeFrontmatterText(frontmatter.topicEn);
  const topicRaw = normalizeFrontmatterText(frontmatter.topic);

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
    topicZh = headings[0]?.title ?? (weekNumber > 0 ? `第${weekNumber}周` : "未分类");
  }
  if (!topicEn) {
    topicEn = headings.find((heading) => heading.enTitle)?.enTitle ?? (weekNumber > 0 ? `Week ${weekNumber}` : enTitle);
  }

  const topic = `${topicZh} / ${topicEn}`;

  const frontmatterSlug = normalizeFrontmatterText(frontmatter.slug);
  const slug = frontmatterSlug ?? (weekNumber > 0 ? `week-${weekNumber}` : slugifyText(path.parse(fileName).name));

  const tagsFromFrontmatter = parseFrontmatterTags(frontmatter.tags);
  const derivedTags = headings
    .map((heading) => heading.title)
    .filter(Boolean)
    .slice(0, 4);
  const tags = tagsFromFrontmatter.length ? tagsFromFrontmatter : derivedTags;

  const order =
    typeof frontmatter.order === "number" && Number.isFinite(frontmatter.order)
      ? frontmatter.order
      : weekNumber > 0
        ? weekNumber
        : Math.floor(stat.mtimeMs);

  return {
    slug,
    title: enTitle,
    enTitle,
    zhTitle,
    description: descriptionEn,
    descriptionEn,
    descriptionZh,
    weekNumber,
    weekLabel: topicEn,
    weekLabelEn: topicEn,
    weekLabelZh: topicZh,
    topic,
    topicEn,
    topicZh,
    tags,
    order,
    source,
    headings,
    filePath,
  };
}

export async function getWeekNotes(): Promise<WeekNote[]> {
  const files = await findNoteFiles();
  const notes = await Promise.all(files.map((filePath) => readNoteFromFile(filePath)));

  return notes
    .filter((note): note is WeekNote => note !== null)
    .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
}

export async function getWeekBySlug(slug: string): Promise<WeekNote | null> {
  const notes = await getWeekNotes();
  return notes.find((note) => note.slug === slug) ?? null;
}

export async function getAdjacentWeeks(slug: string): Promise<{
  previous: WeekNote | null;
  next: WeekNote | null;
}> {
  const notes = await getWeekNotes();
  const index = notes.findIndex((note) => note.slug === slug);

  if (index === -1) {
    return { previous: null, next: null };
  }

  return {
    previous: notes[index - 1] ?? null,
    next: notes[index + 1] ?? null,
  };
}

export async function getKeyTopics(): Promise<string[]> {
  const notes = await getWeekNotes();
  const topicSet = new Set<string>();

  for (const note of notes) {
    if (note.topicZh) {
      topicSet.add(note.topicZh);
    }

    for (const tag of note.tags) {
      topicSet.add(tag);
      if (topicSet.size >= 6) {
        break;
      }
    }

    if (topicSet.size >= 6) {
      break;
    }
  }

  return Array.from(topicSet);
}
