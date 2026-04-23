"use client";

import { useCallback, useMemo, useRef, useState, type ClipboardEvent } from "react";
import { NoteMarkdown } from "@/components/notes/note-markdown";

type EditMode = "append" | "full";

type NoteEditorPanelProps = {
  source: string;
  saving?: boolean;
  onSave: (nextSource: string) => Promise<void>;
  onCancel: () => void;
};

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read pasted image."));
    reader.readAsDataURL(file);
  });
}

function buildAddedBlock(content: string): string {
  const normalized = normalizeNewlines(content).trim();
  if (!normalized) {
    return "";
  }

  const timestamp = new Date().toLocaleString();
  const quotedLines = normalized.split("\n").map((line) => (line.trim() ? `> ${line}` : ">"));

  return [
    "> **【新增内容 / Added】**",
    `> _${timestamp}_`,
    ">",
    ...quotedLines,
  ].join("\n");
}

function appendAddedBlock(source: string, addition: string): string {
  const block = buildAddedBlock(addition);
  if (!block) {
    return source;
  }
  return `${source.trimEnd()}\n\n${block}\n`;
}

export function NoteEditorPanel({ source, saving = false, onSave, onCancel }: NoteEditorPanelProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [mode, setMode] = useState<EditMode>("append");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  const editorValue = draft;
  const previewSource = useMemo(() => {
    if (mode === "full") {
      return editorValue;
    }
    return appendAddedBlock(source, editorValue);
  }, [editorValue, mode, source]);

  const switchMode = useCallback(
    (nextMode: EditMode) => {
      setError("");
      setMode(nextMode);
      setDraft(nextMode === "full" ? source : "");
    },
    [source],
  );

  const insertMarkdown = useCallback(
    (markdown: string) => {
      const textarea = textareaRef.current;
      const current = editorValue;
      if (!textarea) {
        setDraft(`${current}${current ? "\n\n" : ""}${markdown}`);
        return;
      }

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const before = current.slice(0, start);
      const after = current.slice(end);
      const prefix = before && !before.endsWith("\n") ? "\n\n" : "";
      const suffix = after && !after.startsWith("\n") ? "\n\n" : "";
      const nextValue = `${before}${prefix}${markdown}${suffix}${after}`;
      setDraft(nextValue);

      window.requestAnimationFrame(() => {
        const cursor = before.length + prefix.length + markdown.length;
        textarea.focus();
        textarea.setSelectionRange(cursor, cursor);
      });
    },
    [editorValue],
  );

  const handlePaste = useCallback(
    async (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const imageItems = Array.from(event.clipboardData.items)
        .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);

      if (!imageItems.length) {
        return;
      }

      event.preventDefault();
      setError("");

      try {
        const markdownImages = await Promise.all(
          imageItems.map(async (file, index) => {
            const dataUrl = await fileToDataUrl(file);
            const safeName = file.name?.replace(/[^\w.-]+/g, "-") || `pasted-image-${index + 1}.png`;
            return `![${safeName}](${dataUrl})`;
          }),
        );
        insertMarkdown(markdownImages.join("\n\n"));
      } catch (pasteError) {
        setError(pasteError instanceof Error ? pasteError.message : "Failed to insert pasted image.");
      }
    },
    [insertMarkdown],
  );

  const save = useCallback(async () => {
    setError("");
    const nextSource = mode === "append" ? appendAddedBlock(source, draft) : normalizeNewlines(editorValue).trim();
    if (!nextSource.trim()) {
      setError("内容不能为空。");
      return;
    }
    if (nextSource === source) {
      setError("没有可保存的改动。");
      return;
    }
    try {
      await onSave(`${nextSource.trimEnd()}\n`);
      setDraft(mode === "full" ? nextSource : "");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存失败，请稍后重试。");
    }
  }, [draft, editorValue, mode, onSave, source]);

  return (
    <section className="mb-6 rounded-apple border border-primary/25 bg-primary/[0.04] p-4 shadow-card">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            笔记编辑
            <span className="ui-en ml-1">Note Editor</span>
          </p>
          <p className="mt-1 font-text text-[12px] leading-[1.4] text-muted-foreground">
            追加模式会自动生成“新增内容”引用块，方便和原笔记区分；粘贴图片会自动插入 Markdown 图片语法。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => switchMode("append")}
            className={`rounded-capsule border px-3 py-1 text-[12px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              mode === "append" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-accent"
            }`}
          >
            追加新增
          </button>
          <button
            type="button"
            onClick={() => switchMode("full")}
            className={`rounded-capsule border px-3 py-1 text-[12px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              mode === "full" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-accent"
            }`}
          >
            全文编辑
          </button>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-2">
        <label className="min-w-0 space-y-2">
          <span className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Markdown
          </span>
          <textarea
            ref={textareaRef}
            value={editorValue}
            onPaste={handlePaste}
            onChange={(event) => setDraft(event.target.value)}
            rows={18}
            placeholder={
              mode === "append"
                ? "在这里输入要追加到笔记末尾的新增内容。可以直接粘贴截图或图片。"
                : "直接编辑完整 MDX / Markdown 内容。可以直接粘贴截图或图片。"
            }
            className="min-h-[360px] w-full resize-y rounded-apple border border-input bg-background px-3 py-3 font-mono text-[13px] leading-[1.55] text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <section className="min-w-0 space-y-2">
          <p className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Preview
          </p>
          <div className="max-h-[560px] overflow-y-auto rounded-apple border border-border bg-card px-4 py-3">
            <div className="note-prose drake-theme">
              <NoteMarkdown source={previewSource} />
            </div>
          </div>
        </section>
      </div>

      {error ? (
        <p className="mt-3 rounded-apple border border-[#b4232f]/30 bg-[#b4232f]/[0.08] px-3 py-2 font-text text-[13px] leading-[1.4] text-[#7f1820] dark:border-[#ff6a77]/35 dark:bg-[#ff6a77]/[0.12] dark:text-[#ffd5da]">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="btn-apple-primary inline-flex items-center rounded-apple px-5 py-2 font-text text-[14px] transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none"
        >
          {saving ? "保存中..." : mode === "append" ? "保存新增内容" : "保存全文"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="btn-apple-link inline-flex items-center px-4 py-1.5 font-text text-[14px] tracking-tightCaption transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none"
        >
          取消
        </button>
      </div>
    </section>
  );
}
