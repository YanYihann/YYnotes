export type BilingualNoteSections = {
  hasStructuredSections: boolean;
  zhMarkerLine: number;
  enMarkerLine: number;
  zhBody: string;
  enBody: string;
};

function normalizeNewlines(source: string): string {
  return source.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function normalizeSectionMarkerTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[`*_~]/g, "")
    .replace(/[()（）[\]{}<>\-—–_/\\|.,，。:：!?！？\s]/g, "")
    .trim();
}

function matchesAnyMarker(normalized: string, markers: string[]): boolean {
  return markers.some((marker) => normalized === marker || normalized.includes(marker));
}

function isChineseSectionMarker(title: string): boolean {
  const normalized = normalizeSectionMarkerTitle(title);
  return matchesAnyMarker(normalized, [
    "中文版笔记",
    "中文笔记",
    "中文版",
    "chineseversion",
    "chinesenotes",
    "chinesenote",
  ]);
}

function isEnglishSectionMarker(title: string): boolean {
  const normalized = normalizeSectionMarkerTitle(title);
  return matchesAnyMarker(normalized, [
    "englishversion",
    "englishnotes",
    "englishnote",
    "英文版笔记",
    "英文笔记",
    "英文版",
  ]);
}

function extractHeadingTitle(line: string): string | null {
  const match = line.match(/^#{1,6}\s+(.+)$/);
  if (!match) {
    return null;
  }
  return match[1].trim();
}

function trimLeadingSectionDivider(source: string): string {
  return source.replace(/^\s*(?:---|\*\*\*)\s*\n+/, "").trim();
}

export function splitBilingualNoteSections(source: string): BilingualNoteSections {
  const lines = normalizeNewlines(source).split("\n");
  let zhMarkerLine = -1;
  let enMarkerLine = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const headingTitle = extractHeadingTitle(lines[index].trim());
    if (!headingTitle) {
      continue;
    }

    if (zhMarkerLine === -1 && isChineseSectionMarker(headingTitle)) {
      zhMarkerLine = index;
      continue;
    }

    if (enMarkerLine === -1 && isEnglishSectionMarker(headingTitle)) {
      enMarkerLine = index;
    }
  }

  const hasExplicitSections = zhMarkerLine >= 0 && enMarkerLine > zhMarkerLine;
  const hasImplicitChineseSection = zhMarkerLine === -1 && enMarkerLine > 0;
  const hasStructuredSections = hasExplicitSections || hasImplicitChineseSection;

  if (!hasStructuredSections) {
    return {
      hasStructuredSections: false,
      zhMarkerLine,
      enMarkerLine,
      zhBody: "",
      enBody: "",
    };
  }

  const zhStartLine = hasExplicitSections ? zhMarkerLine + 1 : 0;
  const zhBody = trimLeadingSectionDivider(lines.slice(zhStartLine, enMarkerLine).join("\n"));
  const enBody = lines
    .slice(enMarkerLine + 1)
    .join("\n")
    .trim();

  if (!zhBody || !enBody) {
    return {
      hasStructuredSections: false,
      zhMarkerLine,
      enMarkerLine,
      zhBody: "",
      enBody: "",
    };
  }

  return {
    hasStructuredSections: true,
    zhMarkerLine,
    enMarkerLine,
    zhBody,
    enBody,
  };
}
