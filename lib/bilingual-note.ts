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
    .replace(/[：:()（）\[\]{}<>\-—–_/\\|.,，。!?！？\s]/g, "")
    .trim();
}

function isChineseSectionMarker(title: string): boolean {
  const normalized = normalizeSectionMarkerTitle(title);
  return (
    normalized === "中文版笔记" ||
    normalized === "中文笔记" ||
    normalized === "中文版" ||
    normalized === "chineseversion" ||
    normalized === "chinesenotes" ||
    normalized === "chinesenote"
  );
}

function isEnglishSectionMarker(title: string): boolean {
  const normalized = normalizeSectionMarkerTitle(title);
  return (
    normalized === "englishversion" ||
    normalized === "englishnotes" ||
    normalized === "englishnote" ||
    normalized === "英文版笔记" ||
    normalized === "英文笔记" ||
    normalized === "英文版"
  );
}

function extractHeadingTitle(line: string): string | null {
  const match = line.match(/^#{1,6}\s+(.+)$/);
  if (!match) {
    return null;
  }
  return match[1].trim();
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

  const hasStructuredSections = zhMarkerLine >= 0 && enMarkerLine > zhMarkerLine;

  if (!hasStructuredSections) {
    return {
      hasStructuredSections: false,
      zhMarkerLine,
      enMarkerLine,
      zhBody: "",
      enBody: "",
    };
  }

  const zhBody = lines
    .slice(zhMarkerLine + 1, enMarkerLine)
    .join("\n")
    .trim();
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
