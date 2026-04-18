import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import GithubSlugger from "github-slugger";

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
};

const WEEK_FILE_PATTERN = /^week(\d+)\.mdx$/i;
const CONTENT_DIRS = ["", path.join("content", "weeks")];
const DEFAULT_DESCRIPTION_EN = "Bilingual study notes.";
const DEFAULT_DESCRIPTION_ZH = "双语学习笔记。";

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
  const sentenceSplit = line.match(/^(.*[\u4e00-\u9fff].*?[。！？!?])\s+([A-Za-z][\s\S]*)$/u);
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

    // English heading followed by Chinese heading in the same level:
    // use Chinese title as primary and keep English as secondary for optional display.
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

async function findWeekFiles(): Promise<string[]> {
  const root = process.cwd();
  const found = new Set<string>();

  for (const relativeDir of CONTENT_DIRS) {
    const absoluteDir = path.join(root, relativeDir);

    try {
      const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) {
          continue;
        }

        if (!WEEK_FILE_PATTERN.test(entry.name)) {
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

async function readWeekFromFile(filePath: string): Promise<WeekNote | null> {
  const fileName = path.basename(filePath);
  const weekMatch = fileName.match(WEEK_FILE_PATTERN);

  if (!weekMatch) {
    return null;
  }

  const raw = await fs.readFile(filePath, "utf8");
  const parsed = matter(raw);
  const frontmatter = parsed.data as Frontmatter;
  const topTitles = extractTopLevelBilingualTitles(parsed.content);

  const weekFromName = Number(weekMatch[1]);
  const weekNumber = frontmatter.week ?? weekFromName;
  const order = frontmatter.order ?? weekNumber;
  const frontmatterTitle = frontmatter.title?.trim();
  const frontmatterTitleLang = frontmatterTitle ? detectLanguage(frontmatterTitle) : "none";
  const enTitle =
    frontmatterTitle && frontmatterTitleLang !== "zh"
      ? frontmatterTitle
      : topTitles.enTitle ?? `Week ${weekNumber}`;
  const zhTitle =
    frontmatterTitle && frontmatterTitleLang === "zh"
      ? frontmatterTitle
      : topTitles.zhTitle ?? `第${weekNumber}周`;
  const title = enTitle;
  const source = stripLeadingTopHeadings(parsed.content);
  const parsedDescriptions = extractBilingualDescription(source);
  const frontmatterDescription = frontmatter.description?.trim();
  const frontmatterDescriptionLang = frontmatterDescription ? detectLanguage(frontmatterDescription) : "none";

  const descriptionEnCandidate =
    frontmatter.descriptionEn?.trim() ??
    (frontmatterDescriptionLang !== "zh" ? frontmatterDescription : undefined) ??
    parsedDescriptions.descriptionEn ??
    extractFirstParagraph(source);
  const descriptionEn =
    descriptionEnCandidate && detectLanguage(descriptionEnCandidate) !== "zh" ? descriptionEnCandidate : DEFAULT_DESCRIPTION_EN;

  const descriptionZh =
    frontmatter.descriptionZh?.trim() ??
    (frontmatterDescriptionLang === "zh" ? frontmatterDescription : undefined) ??
    parsedDescriptions.descriptionZh ??
    `第${weekNumber}周${DEFAULT_DESCRIPTION_ZH}`;
  const description = descriptionEn;
  const slug = frontmatter.slug ?? `week-${weekNumber}`;
  const headings = extractHeadings(source);
  const weekLabelEn = `Week ${weekNumber}`;
  const weekLabelZh = `第${weekNumber}周`;

  return {
    slug,
    title,
    enTitle,
    zhTitle,
    description,
    descriptionEn,
    descriptionZh,
    weekNumber,
    weekLabel: weekLabelEn,
    weekLabelEn,
    weekLabelZh,
    order,
    source,
    headings,
    filePath,
  };
}

export async function getWeekNotes(): Promise<WeekNote[]> {
  const files = await findWeekFiles();
  const notes = await Promise.all(files.map((filePath) => readWeekFromFile(filePath)));

  return notes
    .filter((note): note is WeekNote => note !== null)
    .sort((a, b) => a.order - b.order || a.weekNumber - b.weekNumber);
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
    for (const heading of note.headings) {
      topicSet.add(heading.title);
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
