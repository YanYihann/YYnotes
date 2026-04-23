"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import rehypeKatex from "rehype-katex";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { useLanguage } from "@/components/language-provider";
import { askNoteAssistant } from "@/lib/ai/client";
import type { AssistantMessage, NoteAssistantRequest } from "@/lib/ai/note-assistant";
import { PromptBox, type PromptAttachment, type PromptSubmitPayload } from "@/components/ui/chatgpt-prompt-input";
import { ASSISTANT_MODEL_OPTIONS } from "@/components/ui/animated-ai-input";

type NoteAssistantPanelProps = {
  noteContext: {
    slug: string;
    weekLabelZh: string;
    weekLabelEn: string;
    zhTitle: string;
    enTitle: string;
    noteContent: string;
  };
};

type SavedQuestionRecord = {
  id: string;
  title: string;
  question: string;
  answer: string;
  createdAt: string;
  noteSlug: string;
  weekLabelZh: string;
  weekLabelEn: string;
  zhTitle: string;
  enTitle: string;
};

const STARTER_MESSAGE_ZH = "你好，我是当前笔记页的学习助手。你可以直接问答，或选中左侧笔记文本来进行针对性问答。";
const STARTER_MESSAGE_EN = "Hi, I am your note-aware assistant for this page. You can ask directly or select text from the note on the left for targeted Q&A.";

const HISTORY_STORAGE_KEY = "na_ai_question_history_v1";
const MAX_SAVED_RECORDS = 160;
const FONT_SIZE_STORAGE_KEY = "na_ai_font_size_v1";
const DEFAULT_FONT_SIZE = 12;
const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 20;
const MAX_ATTACHMENT_SNIPPET_CHARS = 1200;
const MAX_ATTACHMENT_TOTAL_CHARS = 3000;

function clampFontSize(value: number): number {
  if (Number.isNaN(value)) {
    return DEFAULT_FONT_SIZE;
  }
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, value));
}

function buildStarterMessage(showEnglish: boolean): AssistantMessage {
  return {
    role: "assistant",
    content: showEnglish ? `${STARTER_MESSAGE_ZH}\n\n${STARTER_MESSAGE_EN}` : STARTER_MESSAGE_ZH,
  };
}

function trimSelectionText(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.length > 1000 ? `${trimmed.slice(0, 1000)}...` : trimmed;
}

function summarizeSelectionTextInline(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  const chars = Array.from(normalized);
  const headSize = 14;
  const tailSize = 10;
  const minLengthForEllipsis = headSize + tailSize + 4;
  if (chars.length <= minLengthForEllipsis) {
    return normalized;
  }
  return `${chars.slice(0, headSize).join("")}...${chars.slice(chars.length - tailSize).join("")}`;
}

function serializeHistory(messages: AssistantMessage[]): AssistantMessage[] {
  const maxMessages = 8;
  const clean = messages.filter((message) => message.role === "assistant" || message.role === "user");
  if (clean.length <= maxMessages) {
    return clean;
  }
  return clean.slice(clean.length - maxMessages);
}

function normalizeAssistantMarkdown(text: string): string {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .replace(/\\\[/g, "$$")
    .replace(/\\\]/g, "$$")
    .split("\n");

  const transformed = lines.map((line) => {
    const trimmed = line.trim();
    const parenthesizedMatch = trimmed.match(/^\(([\s\S]+)\)$/);
    if (parenthesizedMatch) {
      const inner = parenthesizedMatch[1].trim();
      // Many model outputs wrap a full equation line with "(" and ")" instead of "$$...$$".
      if (/(\\frac|\\sqrt|\\sum|\\int|\\lim|\\cdot|\\times|\\approx|\\le|\\ge|\^|_)/.test(inner)) {
        return `$$\n${inner}\n$$`;
      }
    }
    if (/^\$[^$\n]+\$$/.test(trimmed)) {
      return `$$\n${trimmed.slice(1, -1).trim()}\n$$`;
    }
    return line;
  });

  return transformed.join("\n");
}

function buildRecordTitle(question: string): string {
  const clean = question.replace(/\s+/g, " ").trim();
  if (!clean) {
    return "未命名提问";
  }

  const punctuationIndex = clean.search(/[。！？?!.]/u);
  if (punctuationIndex > 7 && punctuationIndex <= 28) {
    return clean.slice(0, punctuationIndex + 1);
  }
  if (clean.length <= 28) {
    return clean;
  }
  return `${clean.slice(0, 28)}...`;
}

function createRecordId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseSavedRecords(raw: string | null): SavedQuestionRecord[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is SavedQuestionRecord => {
        return Boolean(
          item &&
            typeof item === "object" &&
            typeof (item as SavedQuestionRecord).id === "string" &&
            typeof (item as SavedQuestionRecord).title === "string" &&
            typeof (item as SavedQuestionRecord).question === "string" &&
            typeof (item as SavedQuestionRecord).answer === "string",
        );
      })
      .slice(0, MAX_SAVED_RECORDS);
  } catch {
    return [];
  }
}

function isTextAttachment(file: File): boolean {
  const textType = file.type.startsWith("text/");
  const textExt = /\.(txt|md|markdown|json|csv|tsv|tex|log|py|js|jsx|ts|tsx|java|c|cpp|h|hpp)$/i.test(file.name);
  return textType || textExt;
}

function formatAttachmentSize(size: number): string {
  if (size < 1024) {
    return `${size}B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)}KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)}MB`;
}

async function buildQuestionWithAttachments(question: string, attachments: PromptAttachment[]): Promise<string> {
  const cleanQuestion = question.trim();
  if (attachments.length === 0) {
    return cleanQuestion;
  }

  const baseQuestion = cleanQuestion || "请结合我上传的资料回答。";
  const attachmentLines: string[] = [];
  let remainingChars = MAX_ATTACHMENT_TOTAL_CHARS;

  for (const attachment of attachments.slice(0, 8)) {
    const isVoice = attachment.source === "voice";
    const sourceLabel = isVoice ? "语音" : "文件";
    attachmentLines.push(
      `- ${sourceLabel}：${attachment.name}（${attachment.type || "unknown"}, ${formatAttachmentSize(attachment.size)}）`,
    );

    if (!isTextAttachment(attachment.file) || attachment.file.size > 512 * 1024) {
      continue;
    }

    try {
      const rawText = await attachment.file.text();
      const normalized = rawText.replace(/\s+/g, " ").trim();
      if (!normalized) {
        continue;
      }
      const snippetLength = Math.min(MAX_ATTACHMENT_SNIPPET_CHARS, remainingChars);
      if (snippetLength <= 0) {
        attachmentLines.push("- 更多附件文本已省略（超出长度限制）。");
        break;
      }

      const snippet = normalized.slice(0, snippetLength);
      remainingChars -= snippet.length;
      attachmentLines.push(`  摘录：${snippet}${normalized.length > snippet.length ? "..." : ""}`);
    } catch {
      attachmentLines.push("  摘录读取失败，已仅提供文件元信息。");
    }
  }

  return `${baseQuestion}\n\n【用户上传内容】\n${attachmentLines.join("\n")}\n\n请结合上述上传内容与当前笔记上下文回答。`;
}

export function NoteAssistantPanel({ noteContext }: NoteAssistantPanelProps) {
  const { showEnglish } = useLanguage();
  const [messages, setMessages] = useState<AssistantMessage[]>(() => [buildStarterMessage(showEnglish)]);
  const [input, setInput] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopFullscreen, setDesktopFullscreen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [savedRecords, setSavedRecords] = useState<SavedQuestionRecord[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [fontSizePx, setFontSizePx] = useState(DEFAULT_FONT_SIZE);
  const [selectedModel, setSelectedModel] = useState("gpt-5.4-nano-2026-03-17");

  const desktopMessagesRef = useRef<HTMLDivElement>(null);
  const mobileMessagesRef = useRef<HTMLDivElement>(null);
  const fullscreenMessagesRef = useRef<HTMLDivElement>(null);

  const noteRecords = useMemo(() => savedRecords.filter((record) => record.noteSlug === noteContext.slug), [savedRecords, noteContext.slug]);

  const selectedRecord = useMemo(() => {
    if (!selectedRecordId) {
      return noteRecords[0] ?? null;
    }
    return savedRecords.find((record) => record.id === selectedRecordId) ?? null;
  }, [savedRecords, noteRecords, selectedRecordId]);

  useEffect(() => {
    setMessages((current) => {
      const nextStarter = buildStarterMessage(showEnglish);
      if (current.length !== 1 || current[0]?.role !== "assistant") {
        return current;
      }
      if (current[0].content === nextStarter.content) {
        return current;
      }
      return [nextStarter];
    });
  }, [showEnglish]);

  useEffect(() => {
    const collectSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        return;
      }
      const text = trimSelectionText(selection.toString());
      const anchorNode = selection.anchorNode;
      const focusNode = selection.focusNode;
      const noteRoots = Array.from(document.querySelectorAll("[data-note-content]"));

      if (!anchorNode || !focusNode || noteRoots.length === 0) {
        return;
      }

      const inAnyNoteRoot = noteRoots.some((root) => root.contains(anchorNode) && root.contains(focusNode));
      if (!inAnyNoteRoot || !text) {
        return;
      }
      setSelectedText(text);
    };

    document.addEventListener("selectionchange", collectSelection);
    return () => {
      document.removeEventListener("selectionchange", collectSelection);
    };
  }, []);

  useEffect(() => {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    setSavedRecords(parseSavedRecords(raw));
    setHistoryLoaded(true);
  }, []);

  useEffect(() => {
    if (!historyLoaded) {
      return;
    }
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(savedRecords));
  }, [savedRecords, historyLoaded]);

  useEffect(() => {
    const raw = window.localStorage.getItem(FONT_SIZE_STORAGE_KEY);
    if (!raw) {
      return;
    }
    const parsed = Number(raw);
    setFontSizePx(clampFontSize(parsed));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(fontSizePx));
  }, [fontSizePx]);

  useEffect(() => {
    if (desktopMessagesRef.current) {
      desktopMessagesRef.current.scrollTop = desktopMessagesRef.current.scrollHeight;
    }
    if (mobileMessagesRef.current) {
      mobileMessagesRef.current.scrollTop = mobileMessagesRef.current.scrollHeight;
    }
    if (fullscreenMessagesRef.current) {
      fullscreenMessagesRef.current.scrollTop = fullscreenMessagesRef.current.scrollHeight;
    }
  }, [messages, loading, desktopFullscreen]);

  useEffect(() => {
    if (historyOpen && !selectedRecordId) {
      const fallback = noteRecords[0] ?? savedRecords[0] ?? null;
      setSelectedRecordId(fallback?.id ?? null);
    }
  }, [historyOpen, noteRecords, savedRecords, selectedRecordId]);

  const requestAssistant = useCallback(
    async (question: string, quickAction?: string): Promise<boolean> => {
      const normalizedQuestion = question.trim();
      if (!normalizedQuestion || loading) {
        return false;
      }

      setError("");
      const nextUserMessage: AssistantMessage = { role: "user", content: normalizedQuestion };
      const nextMessages = [...messages, nextUserMessage];
      setMessages(nextMessages);
      setLoading(true);

      try {
        const payload: NoteAssistantRequest = {
          question: normalizedQuestion,
          quickAction,
          model: selectedModel,
          history: serializeHistory(nextMessages),
          context: {
            ...noteContext,
            selectedText: selectedText || undefined,
          },
        };

        const response = await askNoteAssistant(payload);
        const answer = response.answer;
        setMessages((current) => [...current, { role: "assistant", content: answer }]);

        const record: SavedQuestionRecord = {
          id: createRecordId(),
          title: buildRecordTitle(normalizedQuestion),
          question: normalizedQuestion,
          answer,
          createdAt: new Date().toISOString(),
          noteSlug: noteContext.slug,
          weekLabelZh: noteContext.weekLabelZh,
          weekLabelEn: noteContext.weekLabelEn,
          zhTitle: noteContext.zhTitle,
          enTitle: noteContext.enTitle,
        };

        setSavedRecords((current) => [record, ...current].slice(0, MAX_SAVED_RECORDS));
        setSelectedRecordId(record.id);
        return true;
      } catch (requestError) {
        const message = requestError instanceof Error ? requestError.message : "请求失败，请稍后重试。";
        setError(message);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [loading, messages, noteContext, selectedModel, selectedText],
  );

  const submitPrompt = useCallback(
    async (payload: PromptSubmitPayload): Promise<boolean> => {
      const originalQuestion = payload.text.trim();
      if (!originalQuestion && payload.attachments.length === 0) {
        return false;
      }

      const enrichedQuestion = await buildQuestionWithAttachments(originalQuestion, payload.attachments);
      const success = await requestAssistant(enrichedQuestion);
      if (success) {
        setInput("");
      }
      return success;
    },
    [requestAssistant],
  );

  const decreaseFontSize = useCallback(() => {
    setFontSizePx((current) => clampFontSize(current - 1));
  }, []);

  const increaseFontSize = useCallback(() => {
    setFontSizePx((current) => clampFontSize(current + 1));
  }, []);

  const resetFontSize = useCallback(() => {
    setFontSizePx(DEFAULT_FONT_SIZE);
  }, []);

  const messageTextStyle = useMemo(
    () => ({
      fontSize: `${fontSizePx}px`,
      lineHeight: 1.6,
    }),
    [fontSizePx],
  );

  const renderFontSizeControls = (compact = false) => (
    <div className="inline-flex items-center gap-1 rounded-capsule border border-border bg-card/80 px-1 py-0.5">
      <button
        type="button"
        onClick={decreaseFontSize}
        disabled={fontSizePx <= MIN_FONT_SIZE}
        className="rounded-capsule px-1.5 py-0 text-[11px] font-semibold tracking-tightCaption text-muted-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Decrease assistant font size"
        title="A-"
      >
        A-
      </button>
      <button
        type="button"
        onClick={resetFontSize}
        className="rounded-capsule px-1.5 py-0 text-[10px] tracking-tightCaption text-muted-foreground transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        title="Reset font size"
      >
        {compact ? `${fontSizePx}px` : `A ${fontSizePx}px`}
      </button>
      <button
        type="button"
        onClick={increaseFontSize}
        disabled={fontSizePx >= MAX_FONT_SIZE}
        className="rounded-capsule px-1.5 py-0 text-[11px] font-semibold tracking-tightCaption text-muted-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Increase assistant font size"
        title="A+"
      >
        A+
      </button>
    </div>
  );

  const renderAssistantMarkdown = (content: string) => (
    <div className="assistant-prose font-text" style={messageTextStyle}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: "ignore" }]]}
      >
        {normalizeAssistantMarkdown(content)}
      </ReactMarkdown>
    </div>
  );

  const renderChatBody = (messagesRef: RefObject<HTMLDivElement | null>) => (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div ref={messagesRef} className="min-h-0 flex-1 overflow-y-auto rounded-apple border border-border bg-card p-3">
        <div className="space-y-3">
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`rounded-apple px-3 py-2 ${
                message.role === "assistant"
                  ? "bg-muted text-foreground"
                  : "ml-5 bg-primary/15 text-foreground"
              }`}
            >
              <p className="mb-1 font-text text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {message.role === "assistant" ? "AI Study Assistant" : "You"}
              </p>
              {message.role === "assistant" ? (
                renderAssistantMarkdown(message.content)
              ) : (
                <p className="whitespace-pre-wrap font-text" style={messageTextStyle}>
                  {message.content}
                </p>
              )}
            </div>
          ))}
          {loading ? (
            <p className="font-text text-[13px] leading-[1.45] text-muted-foreground">
              正在整理当前页面上下文并生成回答...
              <span className="ui-en ml-1">Thinking with current note context...</span>
            </p>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="rounded-apple border border-[#b4232f]/30 bg-[#b4232f]/[0.08] px-3 py-2 font-text text-[13px] leading-[1.4] text-[#7f1820] dark:border-[#ff6a77]/35 dark:bg-[#ff6a77]/[0.12] dark:text-[#ffd5da]">
          {error}
        </p>
      ) : null}

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            提问
            <span className="ui-en ml-1">Ask a Question</span>
          </label>
          {selectedText ? (
            <div className="inline-flex max-w-[70%] items-center gap-1 rounded-capsule border border-primary/35 bg-primary/10 px-2 py-0.5">
              <span className="shrink-0 font-text text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                已选文本
              </span>
              <span className="min-w-0 truncate font-text text-[10px] leading-[1.2] text-muted-foreground">
                {summarizeSelectionTextInline(selectedText)}
              </span>
              <button
                type="button"
                onClick={() => setSelectedText("")}
                className="shrink-0 rounded-capsule border border-border px-1.5 py-[1px] text-[10px] tracking-tightCaption text-muted-foreground transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                清除
                <span className="ui-en ml-1">Clear</span>
              </button>
            </div>
          ) : null}
        </div>

        <PromptBox
          value={input}
          onValueChange={setInput}
          onSubmitPrompt={submitPrompt}
          disabled={loading}
          modelOptions={ASSISTANT_MODEL_OPTIONS}
          selectedModel={selectedModel}
          onSelectedModelChange={setSelectedModel}
          placeholder="例如：比较本页里的两种方法，并说明误差差异。"
          textareaStyle={messageTextStyle}
          className="rounded-apple"
        />
      </div>
    </div>
  );

  return (
    <>
      <section className="sticky top-20 hidden h-[calc(100dvh-5.75rem)] self-start rounded-apple bg-card/95 p-5 text-card-foreground shadow-card backdrop-blur-sm lg:flex lg:flex-col">
        <header className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              AI 学习助手
              <span className="ui-en ml-1">Study Assistant</span>
            </p>
            <p className="mt-1 font-text text-[13px] leading-[1.35] text-muted-foreground">
              当前页面：{noteContext.weekLabelZh}
              <span className="ui-en ml-1">{noteContext.weekLabelEn}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {renderFontSizeControls()}
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="rounded-capsule border border-border px-2.5 py-0.5 text-[11px] tracking-tightCaption text-muted-foreground transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              提问历史
              <span className="ui-en ml-1">History</span>
            </button>
            <button
              type="button"
              onClick={() => setDesktopFullscreen(true)}
              className="rounded-capsule border border-border px-2.5 py-0.5 text-[11px] tracking-tightCaption text-muted-foreground transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              全屏
              <span className="ui-en ml-1">Fullscreen</span>
            </button>
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col">{renderChatBody(desktopMessagesRef)}</div>
      </section>

      {desktopFullscreen ? (
        <div className="fixed inset-0 z-[90] hidden overflow-y-auto bg-black/60 backdrop-blur-[2px] lg:block">
          <div className="mx-4 my-4 min-h-[calc(100dvh-2rem)] rounded-[12px] bg-background p-4 shadow-card">
            <div className="flex min-h-[calc(100dvh-4rem)] flex-col">
              <header className="mb-3 flex items-center justify-between gap-3">
                <p className="font-display text-[21px] font-semibold leading-[1.19] tracking-[0.231px] text-foreground">
                  AI 学习助手
                  <span className="ui-en ml-2 text-[0.75em] font-normal text-muted-foreground">Fullscreen</span>
                </p>
                {renderFontSizeControls()}
                <button
                  type="button"
                  onClick={() => setDesktopFullscreen(false)}
                  className="rounded-capsule border border-border px-3 py-1 text-[12px] tracking-tightCaption text-muted-foreground transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  退出全屏
                  <span className="ui-en ml-1">Exit</span>
                </button>
              </header>
              <div className="min-h-0 flex-1">{renderChatBody(fullscreenMessagesRef)}</div>
            </div>
          </div>
        </div>
      ) : null}

      {historyOpen ? (
        <div className="fixed inset-0 z-[95] bg-black/60 backdrop-blur-[2px]">
          <div className="absolute inset-3 rounded-[12px] bg-background p-3 shadow-card md:inset-6 md:p-4">
            <div className="flex h-full flex-col">
              <header className="mb-3 flex items-center justify-between gap-3">
                <p className="font-display text-[21px] font-semibold leading-[1.19] tracking-[0.231px] text-foreground">
                  提问历史
                  <span className="ui-en ml-2 text-[0.75em] font-normal text-muted-foreground">Question History</span>
                </p>
                <button
                  type="button"
                  onClick={() => setHistoryOpen(false)}
                  className="rounded-capsule border border-border px-3 py-1 text-[12px] tracking-tightCaption text-muted-foreground transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  关闭
                  <span className="ui-en ml-1">Close</span>
                </button>
              </header>

              <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[300px_minmax(0,1fr)]">
                <section className="min-h-0 overflow-y-auto rounded-apple border border-border bg-card p-2">
                  <div className="space-y-2">
                    {noteRecords.length === 0 ? (
                      <p className="px-2 py-3 font-text text-[13px] leading-[1.45] text-muted-foreground">
                        暂无提问记录。
                        <span className="ui-en ml-1">No history yet.</span>
                      </p>
                    ) : (
                      noteRecords.map((record) => {
                        const active = selectedRecord?.id === record.id;
                        const timeLabel = new Date(record.createdAt).toLocaleString();
                        return (
                          <button
                            key={record.id}
                            type="button"
                            onClick={() => setSelectedRecordId(record.id)}
                            className={`w-full rounded-apple border px-3 py-2 text-left transition ${
                              active
                                ? "border-primary/50 bg-primary/10"
                                : "border-border bg-card hover:bg-accent"
                            }`}
                          >
                            <p className="font-text text-[13px] font-semibold leading-[1.4] text-foreground">{record.title}</p>
                            <p className="mt-1 line-clamp-2 font-text text-[12px] leading-[1.4] text-muted-foreground">{record.question}</p>
                            <p className="mt-1 font-text text-[11px] leading-[1.35] text-muted-foreground">{timeLabel}</p>
                          </button>
                        );
                      })
                    )}
                  </div>
                </section>

                <section className="min-h-0 overflow-y-auto rounded-apple border border-border bg-card p-4">
                  {selectedRecord ? (
                    <div className="space-y-4">
                      <div>
                        <p className="font-display text-[19px] font-semibold leading-[1.2] text-foreground">{selectedRecord.title}</p>
                        <p className="mt-1 font-text text-[12px] leading-[1.4] text-muted-foreground">
                          {selectedRecord.weekLabelZh}
                          <span className="ui-en ml-1">{selectedRecord.weekLabelEn}</span>
                        </p>
                      </div>

                      <div className="rounded-apple bg-muted px-3 py-2">
                        <p className="mb-1 font-text text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Question</p>
                        <p className="font-text text-foreground" style={messageTextStyle}>
                          {selectedRecord.question}
                        </p>
                      </div>

                      <div className="rounded-apple bg-muted px-3 py-2">
                        <p className="mb-1 font-text text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Answer</p>
                        {renderAssistantMarkdown(selectedRecord.answer)}
                      </div>
                    </div>
                  ) : (
                    <p className="font-text text-[14px] leading-[1.45] text-muted-foreground">
                      请选择一条提问记录查看详情。
                      <span className="ui-en ml-1">Select a history card to view details.</span>
                    </p>
                  )}
                </section>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="btn-apple-primary fixed bottom-5 right-4 z-[60] inline-flex items-center rounded-capsule px-4 py-2 font-text text-[14px] shadow-card transition focus-visible:outline-none"
        >
          AI 学习助手
          <span className="ui-en ml-1">Ask AI</span>
        </button>

        {mobileOpen ? (
          <div className="fixed inset-0 z-[70] bg-black/45 backdrop-blur-[1px]">
            <div className="absolute inset-x-0 bottom-0 flex h-[min(88dvh,calc(100dvh-1rem))] flex-col rounded-t-[18px] bg-background p-4">
              <header className="mb-3 flex items-center justify-between">
                <p className="font-display text-[21px] font-semibold leading-[1.19] tracking-[0.231px] text-foreground">
                  AI 学习助手
                  <span className="ui-en ml-2 text-[0.75em] font-normal text-muted-foreground">Study Assistant</span>
                </p>
                <div className="flex items-center gap-2">
                  {renderFontSizeControls(true)}
                  <button
                    type="button"
                    onClick={() => setHistoryOpen(true)}
                    className="rounded-capsule border border-border px-3 py-1 text-[12px] tracking-tightCaption text-muted-foreground transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    历史
                    <span className="ui-en ml-1">History</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileOpen(false)}
                    className="rounded-capsule border border-border px-3 py-1 text-[12px] tracking-tightCaption text-muted-foreground transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    关闭
                    <span className="ui-en ml-1">Close</span>
                  </button>
                </div>
              </header>
              <div className="flex min-h-0 flex-1 flex-col">{renderChatBody(mobileMessagesRef)}</div>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
