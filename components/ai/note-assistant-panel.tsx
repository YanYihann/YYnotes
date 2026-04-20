"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import rehypeKatex from "rehype-katex";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { useLanguage } from "@/components/language-provider";
import { askNoteAssistant } from "@/lib/ai/client";
import type { AssistantMessage, NoteAssistantRequest } from "@/lib/ai/note-assistant";

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

function buildStarterMessage(showEnglish: boolean): AssistantMessage {
  return {
    role: "assistant",
    content: showEnglish ? `${STARTER_MESSAGE_ZH}\n\n${STARTER_MESSAGE_EN}` : STARTER_MESSAGE_ZH,
  };
}

const HISTORY_STORAGE_KEY = "na_ai_question_history_v1";
const MAX_SAVED_RECORDS = 160;
const FONT_SIZE_STORAGE_KEY = "na_ai_font_size_v1";
const DEFAULT_FONT_SIZE = 14;
const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 20;

function clampFontSize(value: number): number {
  if (Number.isNaN(value)) {
    return DEFAULT_FONT_SIZE;
  }
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, value));
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

function isStandaloneAssistantFormulaLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }

  if (/^(```|\$\$|#{1,6}\s|>\s|[-*+]\s|\d+\.\s)/.test(trimmed)) {
    return false;
  }

  if (/^\$[^$\n]+\$$/.test(trimmed) || /^\\\([\s\S]*\\\)$/.test(trimmed) || /^\\\[[\s\S]*\\\]$/.test(trimmed)) {
    return false;
  }

  const hasChinese = /[\u4e00-\u9fff]/.test(trimmed);
  const hasLetters = /[A-Za-z]/.test(trimmed);
  const hasMathSignal = /[=+\-*/^<>_{}()[\]\\]|∑|∫|√|≈|≤|≥|±|\d/.test(trimmed);

  return !hasChinese && hasLetters && hasMathSignal && !/[A-Za-z]{3,}\s+[A-Za-z]{3,}/.test(trimmed);
}

function wrapAssistantFormulaLines(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const output: string[] = [];
  let inCodeFence = false;
  let inMathBlock = false;

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inCodeFence = !inCodeFence;
      output.push(line);
      continue;
    }

    if (!inCodeFence && /^\s*\$\$/.test(line)) {
      inMathBlock = !inMathBlock;
      output.push(line);
      continue;
    }

    if (inCodeFence || inMathBlock) {
      output.push(line);
      continue;
    }

    if (isStandaloneAssistantFormulaLine(line)) {
      output.push("$$");
      output.push(line.trim());
      output.push("$$");
      continue;
    }

    output.push(line);
  }

  return output.join("\n");
}

function normalizeAssistantMarkdown(text: string): string {
  const normalized = text
    .replace(/\\\[/g, "$$")
    .replace(/\\\]/g, "$$")
    .replace(/\\\(/g, "$")
    .replace(/\\\)/g, "$");

  return wrapAssistantFormulaLines(normalized);
}

function buildRecordTitle(question: string): string {
  const clean = question.replace(/\s+/g, " ").trim();
  if (!clean) {
    return "未命名提问";
  }

  const punctuationIndex = clean.search(/[。！？!?]/u);
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

  const desktopMessagesRef = useRef<HTMLDivElement>(null);
  const mobileMessagesRef = useRef<HTMLDivElement>(null);
  const fullscreenMessagesRef = useRef<HTMLDivElement>(null);

  const noteRecords = useMemo(() => {
    return savedRecords.filter((record) => record.noteSlug === noteContext.slug);
  }, [savedRecords, noteContext.slug]);

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
      if (!inAnyNoteRoot) {
        return;
      }

      if (!text) {
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
    const parsed = parseSavedRecords(raw);
    setSavedRecords(parsed);
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
    async (question: string, quickAction?: string) => {
      const normalizedQuestion = question.trim();
      if (!normalizedQuestion || loading) {
        return;
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
      } catch (requestError) {
        const message = requestError instanceof Error ? requestError.message : "请求失败，请稍后重试。";
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [loading, messages, noteContext, selectedText],
  );

  const submitInput = useCallback(async () => {
    const question = input.trim();
    if (!question) {
      return;
    }
    setInput("");
    await requestAssistant(question);
  }, [input, requestAssistant]);

  const onTextareaKeyDown = useCallback(
    async (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== "Enter" || event.shiftKey) {
        return;
      }
      event.preventDefault();
      await submitInput();
    },
    [submitInput],
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
    <div className="inline-flex items-center gap-1 rounded-capsule border border-black/20 bg-white/75 px-1 py-0.5 dark:border-white/25 dark:bg-white/[0.04]">
      <button
        type="button"
        onClick={decreaseFontSize}
        disabled={fontSizePx <= MIN_FONT_SIZE}
        className="rounded-capsule px-1.5 py-0 text-[11px] font-semibold tracking-tightCaption text-black/74 transition hover:bg-black/[0.06] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:text-white/78 dark:hover:bg-white/[0.08]"
        aria-label="Decrease assistant font size"
        title="A-"
      >
        A-
      </button>
      <button
        type="button"
        onClick={resetFontSize}
        className="rounded-capsule px-1.5 py-0 text-[10px] tracking-tightCaption text-black/62 transition hover:bg-black/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:text-white/68 dark:hover:bg-white/[0.08]"
        title="Reset font size"
      >
        {compact ? `${fontSizePx}px` : `A ${fontSizePx}px`}
      </button>
      <button
        type="button"
        onClick={increaseFontSize}
        disabled={fontSizePx >= MAX_FONT_SIZE}
        className="rounded-capsule px-1.5 py-0 text-[11px] font-semibold tracking-tightCaption text-black/74 transition hover:bg-black/[0.06] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:text-white/78 dark:hover:bg-white/[0.08]"
        aria-label="Increase assistant font size"
        title="A+"
      >
        A+
      </button>
    </div>
  );

  const renderAssistantMarkdown = (content: string) => (
    <div className="assistant-prose font-text" style={messageTextStyle}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {normalizeAssistantMarkdown(content)}
      </ReactMarkdown>
    </div>
  );

  const renderChatBody = (messagesRef: RefObject<HTMLDivElement | null>) => (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div ref={messagesRef} className="min-h-0 flex-1 overflow-y-auto rounded-apple border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-[#1d1d1f]">
        <div className="space-y-3">
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`rounded-apple px-3 py-2 ${
                message.role === "assistant"
                  ? "bg-black/[0.04] text-black/82 dark:bg-white/[0.09] dark:text-white/86"
                  : "ml-5 bg-[#0071e3]/[0.12] text-black/88 dark:bg-[#2997ff]/[0.2] dark:text-white"
              }`}
            >
              <p className="mb-1 font-text text-[11px] font-semibold uppercase tracking-[0.08em] text-black/55 dark:text-white/60">
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
            <p className="font-text text-[13px] leading-[1.45] text-black/62 dark:text-white/66">
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
          <label htmlFor="note-assistant-input" className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-black/55 dark:text-white/60">
            {"\u63d0\u95ee"}
            <span className="ui-en ml-1">Ask a Question</span>
          </label>
          {selectedText ? (
            <div className="inline-flex max-w-[70%] items-center gap-1 rounded-capsule border border-[#0071e3]/35 bg-[#0071e3]/[0.06] px-2 py-0.5 dark:border-[#2997ff]/45 dark:bg-[#2997ff]/[0.1]">
              <span className="shrink-0 font-text text-[10px] font-semibold uppercase tracking-[0.06em] text-black/66 dark:text-white/72">
                {"\u5df2\u9009\u6587\u672c"}
              </span>
              <span className="min-w-0 truncate font-text text-[10px] leading-[1.2] text-black/75 dark:text-white/78">
                {summarizeSelectionTextInline(selectedText)}
              </span>
              <button
                type="button"
                onClick={() => setSelectedText("")}
                className="shrink-0 rounded-capsule border border-black/20 px-1.5 py-[1px] text-[10px] tracking-tightCaption text-black/70 transition hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:border-white/25 dark:text-white/74 dark:hover:bg-white/[0.07]"
              >
                {"\u6e05\u9664"}
                <span className="ui-en ml-1">Clear</span>
              </button>
            </div>
          ) : null}
        </div>
        <textarea
          id="note-assistant-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={onTextareaKeyDown}
          rows={3}
          placeholder="例如：比较本页里的两种方法，并说明误差差异。"
          className="w-full rounded-apple border border-black/15 bg-white px-3 py-2 font-text text-black/85 shadow-none outline-none transition placeholder:text-black/45 focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:border-white/20 dark:bg-[#202022] dark:text-white/86 dark:placeholder:text-white/45"
          style={messageTextStyle}
        />
        <button
          type="button"
          onClick={submitInput}
          disabled={loading || !input.trim()}
          className="inline-flex items-center rounded-apple bg-[#0071e3] px-4 py-1.5 font-text text-[14px] text-white transition hover:bg-[#0066cc] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
        >
          发送提问
          <span className="ui-en ml-1">Send</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <section className="sticky top-20 hidden max-h-[calc(100dvh-5.75rem)] self-start rounded-apple bg-white/90 p-5 shadow-card backdrop-blur-sm dark:bg-[#272729]/95 lg:flex lg:flex-col">
        <header className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-black/55 dark:text-white/60">
              AI 学习助手
              <span className="ui-en ml-1">Study Assistant</span>
            </p>
            <p className="mt-1 font-text text-[13px] leading-[1.35] text-black/70 dark:text-white/72">
              当前页面：{noteContext.weekLabelZh}
              <span className="ui-en ml-1">{noteContext.weekLabelEn}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {renderFontSizeControls()}
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="rounded-capsule border border-black/20 px-2.5 py-0.5 text-[11px] tracking-tightCaption text-black/72 transition hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:border-white/25 dark:text-white/78 dark:hover:bg-white/[0.07]"
            >
              提问历史
              <span className="ui-en ml-1">History</span>
            </button>
            <button
              type="button"
              onClick={() => setDesktopFullscreen(true)}
              className="rounded-capsule border border-black/20 px-2.5 py-0.5 text-[11px] tracking-tightCaption text-black/72 transition hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:border-white/25 dark:text-white/78 dark:hover:bg-white/[0.07]"
            >
              全屏
              <span className="ui-en ml-1">Fullscreen</span>
            </button>
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col">{renderChatBody(desktopMessagesRef)}</div>
      </section>

      {desktopFullscreen ? (
        <div className="fixed inset-0 z-[90] hidden bg-black/60 backdrop-blur-[2px] lg:block">
          <div className="absolute inset-4 rounded-[12px] bg-[#f5f5f7] p-4 shadow-card dark:bg-[#111113]">
            <div className="flex h-full flex-col">
              <header className="mb-3 flex items-center justify-between gap-3">
                <p className="font-display text-[21px] font-semibold leading-[1.19] tracking-[0.231px] text-[#1d1d1f] dark:text-white">
                  AI 学习助手
                  <span className="ui-en ml-2 text-[0.75em] font-normal text-black/70 dark:text-white/72">Fullscreen</span>
                </p>
                {renderFontSizeControls()}
                <button
                  type="button"
                  onClick={() => setDesktopFullscreen(false)}
                  className="rounded-capsule border border-black/20 px-3 py-1 text-[12px] tracking-tightCaption text-black/72 transition hover:bg-black/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:border-white/25 dark:text-white/78 dark:hover:bg-white/[0.08]"
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
          <div className="absolute inset-3 rounded-[12px] bg-[#f5f5f7] p-3 shadow-card dark:bg-[#111113] md:inset-6 md:p-4">
            <div className="flex h-full flex-col">
              <header className="mb-3 flex items-center justify-between gap-3">
                <p className="font-display text-[21px] font-semibold leading-[1.19] tracking-[0.231px] text-[#1d1d1f] dark:text-white">
                  提问历史
                  <span className="ui-en ml-2 text-[0.75em] font-normal text-black/70 dark:text-white/72">Question History</span>
                </p>
                <button
                  type="button"
                  onClick={() => setHistoryOpen(false)}
                  className="rounded-capsule border border-black/20 px-3 py-1 text-[12px] tracking-tightCaption text-black/72 transition hover:bg-black/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:border-white/25 dark:text-white/78 dark:hover:bg-white/[0.08]"
                >
                  关闭
                  <span className="ui-en ml-1">Close</span>
                </button>
              </header>

              <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[300px_minmax(0,1fr)]">
                <section className="min-h-0 overflow-y-auto rounded-apple border border-black/12 bg-white p-2 dark:border-white/12 dark:bg-[#1d1d1f]">
                  <div className="space-y-2">
                    {noteRecords.length === 0 ? (
                      <p className="px-2 py-3 font-text text-[13px] leading-[1.45] text-black/62 dark:text-white/66">
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
                                ? "border-[#0071e3]/45 bg-[#0071e3]/[0.08]"
                                : "border-black/10 bg-white hover:bg-black/[0.03] dark:border-white/12 dark:bg-[#232326] dark:hover:bg-white/[0.08]"
                            }`}
                          >
                            <p className="font-text text-[13px] font-semibold leading-[1.4] text-black/82 dark:text-white/86">{record.title}</p>
                            <p className="mt-1 line-clamp-2 font-text text-[12px] leading-[1.4] text-black/63 dark:text-white/65">{record.question}</p>
                            <p className="mt-1 font-text text-[11px] leading-[1.35] text-black/52 dark:text-white/55">{timeLabel}</p>
                          </button>
                        );
                      })
                    )}
                  </div>
                </section>

                <section className="min-h-0 overflow-y-auto rounded-apple border border-black/12 bg-white p-4 dark:border-white/12 dark:bg-[#1d1d1f]">
                  {selectedRecord ? (
                    <div className="space-y-4">
                      <div>
                        <p className="font-display text-[19px] font-semibold leading-[1.2] text-[#1d1d1f] dark:text-white">{selectedRecord.title}</p>
                        <p className="mt-1 font-text text-[12px] leading-[1.4] text-black/60 dark:text-white/62">
                          {selectedRecord.weekLabelZh}
                          <span className="ui-en ml-1">{selectedRecord.weekLabelEn}</span>
                        </p>
                      </div>

                      <div className="rounded-apple bg-black/[0.04] px-3 py-2 dark:bg-white/[0.08]">
                        <p className="mb-1 font-text text-[11px] font-semibold uppercase tracking-[0.08em] text-black/55 dark:text-white/60">Question</p>
                        <p className="font-text text-black/84 dark:text-white/88" style={messageTextStyle}>
                          {selectedRecord.question}
                        </p>
                      </div>

                      <div className="rounded-apple bg-black/[0.04] px-3 py-2 dark:bg-white/[0.08]">
                        <p className="mb-1 font-text text-[11px] font-semibold uppercase tracking-[0.08em] text-black/55 dark:text-white/60">Answer</p>
                        {renderAssistantMarkdown(selectedRecord.answer)}
                      </div>
                    </div>
                  ) : (
                    <p className="font-text text-[14px] leading-[1.45] text-black/62 dark:text-white/66">
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
          className="fixed bottom-5 right-4 z-[60] inline-flex items-center rounded-capsule bg-[#0071e3] px-4 py-2 font-text text-[14px] text-white shadow-card transition hover:bg-[#0066cc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          AI 学习助手
          <span className="ui-en ml-1">Ask AI</span>
        </button>

        {mobileOpen ? (
          <div className="fixed inset-0 z-[70] bg-black/45 backdrop-blur-[1px]">
            <div className="absolute inset-x-0 bottom-0 flex h-[min(88dvh,calc(100dvh-1rem))] flex-col rounded-t-[18px] bg-[#f5f5f7] p-4 dark:bg-[#151516]">
              <header className="mb-3 flex items-center justify-between">
                <p className="font-display text-[21px] font-semibold leading-[1.19] tracking-[0.231px] text-[#1d1d1f] dark:text-white">
                  AI 学习助手
                  <span className="ui-en ml-2 text-[0.75em] font-normal text-black/70 dark:text-white/72">Study Assistant</span>
                </p>
                <div className="flex items-center gap-2">
                  {renderFontSizeControls(true)}
                  <button
                    type="button"
                    onClick={() => setHistoryOpen(true)}
                    className="rounded-capsule border border-black/20 px-3 py-1 text-[12px] tracking-tightCaption text-black/72 transition hover:bg-black/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:border-white/25 dark:text-white/78 dark:hover:bg-white/[0.08]"
                  >
                    历史
                    <span className="ui-en ml-1">History</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileOpen(false)}
                    className="rounded-capsule border border-black/20 px-3 py-1 text-[12px] tracking-tightCaption text-black/72 transition hover:bg-black/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:border-white/25 dark:text-white/78 dark:hover:bg-white/[0.08]"
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
