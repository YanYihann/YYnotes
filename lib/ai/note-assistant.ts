export type AssistantRole = "user" | "assistant";

export type AssistantMessage = {
  role: AssistantRole;
  content: string;
};

export type NoteAssistantContext = {
  slug: string;
  weekLabelZh: string;
  weekLabelEn: string;
  zhTitle: string;
  enTitle: string;
  noteContent: string;
  selectedText?: string;
  selectedSection?: string;
};

export type NoteAssistantRequest = {
  question: string;
  quickAction?: string;
  model?: string;
  context: NoteAssistantContext;
  history: AssistantMessage[];
};

const MAX_NOTE_CONTEXT_CHARS = 14000;
const MAX_SELECTION_CHARS = 2200;
const MAX_QUESTION_CHARS = 2000;
const MAX_HISTORY_ITEMS = 8;

function clampText(value: string | undefined, maxChars: number): string {
  if (!value) {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.length > maxChars ? `${trimmed.slice(0, maxChars)}\n...[truncated]` : trimmed;
}

function normalizeHistory(history: AssistantMessage[]): AssistantMessage[] {
  const valid: AssistantMessage[] = history
    .map((item): AssistantMessage => ({
      role: item.role === "assistant" ? "assistant" : "user",
      content: clampText(item.content, MAX_QUESTION_CHARS),
    }))
    .filter((item) => item.content.length > 0);

  if (valid.length <= MAX_HISTORY_ITEMS) {
    return valid;
  }

  return valid.slice(valid.length - MAX_HISTORY_ITEMS);
}

export function sanitizeAssistantPayload(payload: NoteAssistantRequest): NoteAssistantRequest {
  return {
    question: clampText(payload.question, MAX_QUESTION_CHARS),
    quickAction: payload.quickAction ? clampText(payload.quickAction, 120) : undefined,
    model: payload.model ? clampText(payload.model, 80) : undefined,
    history: normalizeHistory(payload.history),
    context: {
      slug: clampText(payload.context.slug, 120),
      weekLabelZh: clampText(payload.context.weekLabelZh, 80),
      weekLabelEn: clampText(payload.context.weekLabelEn, 80),
      zhTitle: clampText(payload.context.zhTitle, 240),
      enTitle: clampText(payload.context.enTitle, 240),
      noteContent: clampText(payload.context.noteContent, MAX_NOTE_CONTEXT_CHARS),
      selectedText: clampText(payload.context.selectedText, MAX_SELECTION_CHARS) || undefined,
      selectedSection: clampText(payload.context.selectedSection, 180) || undefined,
    },
  };
}

export function buildAssistantSystemPrompt(): string {
  return [
    "You are a study assistant integrated into a bilingual note page.",
    "Primary task: help the student understand the CURRENT note content accurately and clearly.",
    "Use the provided note context first. Do not invent formulas or claims that contradict the note.",
    "If the note context is insufficient, explicitly say so and provide cautious guidance.",
    "Keep explanations educational, structured, and concise enough for study use.",
    "When user asks Chinese, answer Chinese. When user asks English, answer English. When user asks bilingual, answer with Chinese first and English below.",
    "When possible, reference formulas, methods, assumptions, and common mistakes from the note.",
    "All mathematical notation must be valid Markdown math for remark-math and KaTeX: use `$...$` for inline formulas and `$$...$$` for display formulas.",
    "Never escape math delimiters as `\\$`; output literal `$...$` or `$$...$$` only.",
    "Never output raw TeX commands outside math delimiters. Do not use bare `\\frac`, `\\sum`, `\\operatorname`, `\\left`, `\\right`, `\\begin{aligned}`, or trailing unmatched `$`/`$$` in prose or table cells.",
    "Do not present yourself as a general unrelated chatbot.",
  ].join("\n");
}

export function buildAssistantUserPrompt(payload: NoteAssistantRequest): string {
  const { context, question, quickAction } = payload;
  const parts: string[] = [];

  parts.push("Current note metadata:");
  parts.push(`- Topic (ZH): ${context.weekLabelZh}`);
  parts.push(`- Topic (EN): ${context.weekLabelEn}`);
  parts.push(`- Title (ZH): ${context.zhTitle}`);
  parts.push(`- Title (EN): ${context.enTitle}`);
  parts.push(`- Slug: ${context.slug}`);

  if (context.selectedSection) {
    parts.push(`- Selected section: ${context.selectedSection}`);
  }

  if (context.selectedText) {
    parts.push("\nUser-selected note text:");
    parts.push(context.selectedText);
  }

  parts.push("\nCurrent note content (markdown):");
  parts.push(context.noteContent);

  if (quickAction) {
    parts.push(`\nQuick action: ${quickAction}`);
  }

  parts.push("\nStudent question:");
  parts.push(question);

  parts.push(
    "\nResponse requirements: prioritize this note context, explain steps clearly, keep terminology consistent with this note's subject, and wrap every formula in `$...$` or `$$...$$` so it renders in KaTeX.",
  );

  return parts.join("\n");
}

export function extractResponseText(responseJson: unknown): string {
  if (!responseJson || typeof responseJson !== "object") {
    return "";
  }

  const direct = (responseJson as { output_text?: unknown }).output_text;
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }

  const output = (responseJson as { output?: unknown }).output;
  if (!Array.isArray(output)) {
    return "";
  }

  const textParts: string[] = [];

  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const contentItem of content) {
      if (!contentItem || typeof contentItem !== "object") {
        continue;
      }

      const text = (contentItem as { text?: unknown }).text;
      if (typeof text === "string" && text.trim()) {
        textParts.push(text.trim());
      }
    }
  }

  return textParts.join("\n\n").trim();
}
