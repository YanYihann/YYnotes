function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripMarkdown(value: string): string {
  return normalizeWhitespace(
    value
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^>\s?/gm, "")
      .replace(/^[-*+]\s+/gm, "")
      .replace(/^\d+\.\s+/gm, "")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\$([^$]+)\$/g, "$1")
      .replace(/\[(.*?)\]\(.*?\)/g, "$1")
      .replace(/\*\*/g, "")
      .replace(/\*/g, ""),
  );
}

function takeLeadingSentence(value: string, language: "zh" | "en"): string {
  const pattern = language === "zh" ? /^(.*?[。！？；])/u : /^(.*?[.!?;])(?:\s|$)/;
  const matched = value.match(pattern);
  return normalizeWhitespace(matched?.[1] ?? value);
}

function clampAtWordBoundary(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  const slice = value.slice(0, maxLength).trimEnd();
  const boundary = slice.lastIndexOf(" ");
  if (boundary >= Math.max(12, Math.floor(maxLength * 0.5))) {
    return `${slice.slice(0, boundary).trimEnd()}...`;
  }

  return `${slice}...`;
}

export function summarizeCardDescription(
  value: string,
  language: "zh" | "en",
  fallback: string,
): string {
  const normalized = stripMarkdown(value);
  const sentence = takeLeadingSentence(normalized || fallback, language);

  if (language === "zh") {
    return sentence.length <= 30 ? sentence : `${sentence.slice(0, 30).trimEnd()}...`;
  }

  return clampAtWordBoundary(sentence, 90);
}
